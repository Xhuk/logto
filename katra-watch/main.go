// Comando katra-watch: el colector de estado de Katra (contrato katra/courier v2).
//
// Vive dentro del stack de Katra, en el VPS, y hace dos cosas: corre los 12 checks
// cada WATCH_INTERVAL y publica el resultado como `state.json` en
// http://127.0.0.1:8081/state.json (el sidecar `ts-watch` lo expone como
// https://katra-watch.tailfadff7.ts.net/state.json, sólo por el tailnet).
//
// Se mira a sí mismo sin privilegios de escritura: el socket de Docker pasa por
// socket-proxy con POST=0 (sólo GET/HEAD), el volumen de backups y el `/` del
// host van montados `:ro`, y el resto son GETs HTTPS. No hay SSH ni llaves.
//
// El `overall` lo calcula acá (peor de los checks): el widget confía, no recalcula.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

type check struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail"`
	Ms     int64  `json:"ms"`
}

type snapshot struct {
	Overall    string  `json:"overall"`
	CheckedAt  string  `json:"checkedAt"`
	DurationMs int64   `json:"durationMs"`
	Source     string  `json:"source"`
	Checks     []check `json:"checks"`
}

type tenant struct {
	Name string
	Base string
}

type config struct {
	Addr        string
	Interval    time.Duration
	StatePath   string
	ProxyURL    string
	Project     string
	Services    []string
	AdminURL    string
	GuideURL    string
	Tenants     []tenant
	BackupDir   string
	HostRoot    string
	MemInfo     string
	Uptime      string
	HTTPTimeout time.Duration
}

func env(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return fallback
}

// parseTenants lee "Nombre|https://base;Otro|https://base".
func parseTenants(raw string) []tenant {
	var out []tenant
	for _, part := range strings.Split(raw, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, base, ok := strings.Cut(part, "|")
		if !ok {
			continue
		}
		out = append(out, tenant{Name: strings.TrimSpace(name), Base: strings.TrimRight(strings.TrimSpace(base), "/")})
	}
	return out
}

func loadConfig() config {
	interval, err := time.ParseDuration(env("WATCH_INTERVAL", "5m"))
	if err != nil {
		interval = 5 * time.Minute
	}
	timeout, err := time.ParseDuration(env("WATCH_HTTP_TIMEOUT", "10s"))
	if err != nil {
		timeout = 10 * time.Second
	}
	services := []string{}
	for _, s := range strings.Split(env("DOCKER_SERVICES", "app,postgres,backup,ts-katra"), ",") {
		if s = strings.TrimSpace(s); s != "" {
			services = append(services, s)
		}
	}
	return config{
		Addr:      env("WATCH_ADDR", ":8081"),
		Interval:  interval,
		StatePath: env("WATCH_STATE_PATH", "/state/state.json"),
		ProxyURL:  strings.TrimRight(env("DOCKER_PROXY", "http://socket-proxy:2375"), "/"),
		Project:   env("DOCKER_PROJECT", "compose-calculate-neural-protocol-dfz99a"),
		Services:  services,
		AdminURL:  env("IDP_ADMIN_URL", "https://katra-imperial.tailfadff7.ts.net:8443/api/status"),
		GuideURL:  env("GUIDE_URL", "https://lotly.lat/auth/api/katra/integration-guide"),
		Tenants: parseTenants(env("TENANTS",
			"Lotly|https://lotly.lat/auth;"+
				"KSH|https://ksh.networkvoid.xyz/auth;"+
				"VetGroom|https://app.vetgroom.com.mx/auth;"+
				"Propflow|https://propflow.kairova.services/auth;"+
				"VetGroom demo|https://demo.vetgroom.com.mx/auth")),
		BackupDir:   env("BACKUP_DIR", "/backups"),
		HostRoot:    env("HOST_ROOT", "/host"),
		MemInfo:     env("HOST_MEMINFO", "/host-meminfo"),
		Uptime:      env("HOST_UPTIME", "/host-uptime"),
		HTTPTimeout: timeout,
	}
}

func httpClient() *http.Client {
	return &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("demasiadas redirecciones")
			}
			return nil
		},
	}
}

// status devuelve el código HTTP y cuánto tardó. Un código es un resultado, no un
// error: sólo el fallo de transporte devuelve err.
func status(ctx context.Context, client *http.Client, url string) (int, int64, error) {
	started := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, time.Since(started).Milliseconds(), err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	return resp.StatusCode, time.Since(started).Milliseconds(), nil
}

func httpCheck(ctx context.Context, client *http.Client, name, url string, want []int) check {
	code, ms, err := status(ctx, client, url)
	if err != nil {
		return check{Name: name, Status: "fail", Detail: "sin respuesta", Ms: ms}
	}
	for _, w := range want {
		if code == w {
			return check{Name: name, Status: "ok", Detail: fmt.Sprintf("HTTP %d", code), Ms: ms}
		}
	}
	return check{Name: name, Status: "fail", Detail: fmt.Sprintf("HTTP %d", code), Ms: ms}
}

/* ── check: stack (contenedores por el proxy de Docker, sólo lectura) ─────── */

type containerInfo struct {
	Name  string
	State string
	Restart string
}

func inspect(ctx context.Context, client *http.Client, proxyURL, name string) (containerInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, proxyURL+"/containers/"+name+"/json", nil)
	if err != nil {
		return containerInfo{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return containerInfo{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return containerInfo{}, fmt.Errorf("proxy HTTP %d", resp.StatusCode)
	}
	var payload struct {
		Name       string `json:"Name"`
		State      struct{ Status string } `json:"State"`
		HostConfig struct {
			RestartPolicy struct{ Name string } `json:"RestartPolicy"`
		} `json:"HostConfig"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return containerInfo{}, err
	}
	return containerInfo{
		Name:    strings.TrimPrefix(payload.Name, "/"),
		State:   payload.State.Status,
		Restart: payload.HostConfig.RestartPolicy.Name,
	}, nil
}

func stackCheck(ctx context.Context, cfg config, client *http.Client) check {
	started := time.Now()
	ok, bad := 0, []string{}
	for _, service := range cfg.Services {
		name := fmt.Sprintf("%s-%s-1", cfg.Project, service)
		info, err := inspect(ctx, client, cfg.ProxyURL, name)
		if err != nil {
			bad = append(bad, fmt.Sprintf("%s (%v)", service, err))
			continue
		}
		if info.State == "running" && info.Restart == "always" {
			ok++
			continue
		}
		bad = append(bad, fmt.Sprintf("%s: %s/restart=%s", service, info.State, info.Restart))
	}
	ms := time.Since(started).Milliseconds()
	if len(bad) == 0 {
		return check{Name: "stack", Status: "ok", Detail: fmt.Sprintf("%d corriendo con restart=always", ok), Ms: ms}
	}
	if ok == 0 {
		return check{Name: "stack", Status: "fail", Detail: "sin respuesta del proxy de Docker", Ms: ms}
	}
	return check{Name: "stack", Status: "fail", Detail: "revisar: " + strings.Join(bad, " / "), Ms: ms}
}

/* ── check: backup (nombre del dump, en UTC, montado :ro) ─────────────────── */

var dumpPattern = regexp.MustCompile(`^katra-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$`)

func backupCheck(cfg config) check {
	started := time.Now()
	entries, err := os.ReadDir(cfg.BackupDir)
	if err != nil {
		return check{Name: "backup", Status: "fail", Detail: "no pude leer el volumen de backups", Ms: time.Since(started).Milliseconds()}
	}
	var newest string
	var newestAt time.Time
	for _, entry := range entries {
		m := dumpPattern.FindStringSubmatch(entry.Name())
		if m == nil {
			continue
		}
		// El nombre lo escribe `date` dentro del contenedor: es UTC. Comparar
		// contra hora local daba edad negativa en la primera versión.
		stamp, err := time.Parse(time.RFC3339, fmt.Sprintf("%s-%s-%sT%s:%s:%sZ", m[1], m[2], m[3], m[4], m[5], m[6]))
		if err != nil {
			continue
		}
		if stamp.After(newestAt) {
			newestAt = stamp
			newest = entry.Name()
		}
	}
	ms := time.Since(started).Milliseconds()
	if newest == "" {
		return check{Name: "backup", Status: "fail", Detail: "no hay ningún dump en el volumen", Ms: ms}
	}
	hours := time.Since(newestAt).Hours()
	if hours < 0 {
		hours = 0
	}
	rounded := float64(int64(hours*10+0.5)) / 10
	detail := fmt.Sprintf("ultimo dump hace %.1f h (%s)", rounded, newest)
	switch {
	case rounded <= 26:
		return check{Name: "backup", Status: "ok", Detail: detail, Ms: ms}
	case rounded <= 48:
		return check{Name: "backup", Status: "warn", Detail: detail, Ms: ms}
	default:
		return check{Name: "backup", Status: "fail", Detail: detail, Ms: ms}
	}
}

/* ── checks del host: disco, memoria, uptime (montajes :ro) ───────────────── */

func diskCheck(cfg config) check {
	started := time.Now()
	var fs syscall.Statfs_t
	if err := syscall.Statfs(cfg.HostRoot, &fs); err != nil {
		return check{Name: "disco", Status: "fail", Detail: "no pude leer el / del host", Ms: time.Since(started).Milliseconds()}
	}
	used := fs.Blocks - fs.Bfree
	total := used + fs.Bavail
	if total == 0 {
		return check{Name: "disco", Status: "fail", Detail: "statfs devolvió 0 bloques", Ms: time.Since(started).Milliseconds()}
	}
	// Mismo criterio que `df -P /`: redondea hacia arriba el uso.
	pct := int((used*100 + total - 1) / total)
	detail := fmt.Sprintf("uso %d%%", pct)
	ms := time.Since(started).Milliseconds()
	switch {
	case pct >= 90:
		return check{Name: "disco", Status: "fail", Detail: detail, Ms: ms}
	case pct >= 80:
		return check{Name: "disco", Status: "warn", Detail: detail, Ms: ms}
	default:
		return check{Name: "disco", Status: "ok", Detail: detail, Ms: ms}
	}
}

func memCheck(cfg config) check {
	started := time.Now()
	raw, err := os.ReadFile(cfg.MemInfo)
	if err != nil {
		return check{Name: "memoria", Status: "warn", Detail: "no pude leer /proc/meminfo", Ms: time.Since(started).Milliseconds()}
	}
	var availableKb int64
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "MemAvailable:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			availableKb, _ = strconv.ParseInt(fields[1], 10, 64)
		}
		break
	}
	gb := float64(int64(float64(availableKb)/1048576*10+0.5)) / 10
	detail := fmt.Sprintf("%.1f GB disponibles", gb)
	ms := time.Since(started).Milliseconds()
	if gb < 0.5 {
		return check{Name: "memoria", Status: "warn", Detail: detail, Ms: ms}
	}
	return check{Name: "memoria", Status: "ok", Detail: detail, Ms: ms}
}

func uptimeCheck(cfg config) check {
	started := time.Now()
	raw, err := os.ReadFile(cfg.Uptime)
	if err != nil {
		return check{Name: "vps-uptime", Status: "ok", Detail: "sin lectura de /proc/uptime", Ms: time.Since(started).Milliseconds()}
	}
	fields := strings.Fields(string(raw))
	seconds, _ := strconv.ParseFloat(strings.Split(fields[0], ".")[0], 64)
	days := int(seconds / 86400)
	return check{
		Name:   "vps-uptime",
		Status: "ok",
		Detail: fmt.Sprintf("%d dias sin reiniciar", days),
		Ms:     time.Since(started).Milliseconds(),
	}
}

/* ── corrida completa ────────────────────────────────────────────────────── */

func runChecks(cfg config) snapshot {
	started := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 4*cfg.HTTPTimeout)
	defer cancel()
	client := httpClient()

	checks := []check{stackCheck(ctx, cfg, client), httpCheck(ctx, client, "idp-admin", cfg.AdminURL, []int{204})}

	// Productos: lo que ve el usuario, por su host público.
	for _, t := range cfg.Tenants {
		discoveryCode, discoveryMs, discoveryErr := status(ctx, client, t.Base+"/oidc/.well-known/openid-configuration")
		statusCode, statusMs, statusErr := status(ctx, client, t.Base+"/api/status")
		ok := discoveryErr == nil && discoveryCode == 200 &&
			statusErr == nil && (statusCode == 204 || statusCode == 200)
		detail := ""
		if ok {
			detail = fmt.Sprintf("discovery %dms, status %dms", discoveryMs, statusMs)
		} else {
			d, s := "sin respuesta", "sin respuesta"
			if discoveryErr == nil {
				d = fmt.Sprintf("HTTP %d", discoveryCode)
			}
			if statusErr == nil {
				s = fmt.Sprintf("HTTP %d", statusCode)
			}
			detail = fmt.Sprintf("discovery %s, status %s", d, s)
		}
		result := "ok"
		if !ok {
			result = "fail"
		}
		checks = append(checks, check{Name: "tenant:" + t.Name, Status: result, Detail: detail, Ms: discoveryMs + statusMs})
	}

	// La guía canónica no rompe el login: si falla, es ámbar (severity warn).
	guide := httpCheck(ctx, client, "guide", cfg.GuideURL, []int{200})
	if guide.Status != "ok" {
		guide.Status = "warn"
	}
	checks = append(checks, guide, backupCheck(cfg), diskCheck(cfg), memCheck(cfg), uptimeCheck(cfg))

	overall := "ok"
	for _, c := range checks {
		if c.Status == "fail" {
			overall = "fail"
			break
		}
		if c.Status == "warn" {
			overall = "warn"
		}
	}

	return snapshot{
		Overall:    overall,
		CheckedAt:  started.Format(time.RFC3339),
		DurationMs: time.Since(started).Milliseconds(),
		Source:     "colector",
		Checks:     checks,
	}
}

func writeState(path string, snap snapshot) error {
	body, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func logLine(snap snapshot) {
	var off []string
	for _, c := range snap.Checks {
		if c.Status != "ok" {
			off = append(off, fmt.Sprintf("%s=%s(%s)", c.Name, c.Status, c.Detail))
		}
	}
	sort.Strings(off)
	if len(off) == 0 {
		off = []string{"todos los checks en ok"}
	}
	log.Printf("%s en %d ms · %s · %s", strings.ToUpper(snap.Overall), snap.DurationMs, snap.CheckedAt, strings.Join(off, "; "))
}

func serve(cfg config, ready *atomic.Bool) {
	mux := http.NewServeMux()
	mux.HandleFunc("/state.json", func(w http.ResponseWriter, r *http.Request) {
		// El widget vive en otro origen (https://tauri.localhost): sin CORS no lee.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		body, err := os.ReadFile(cfg.StatePath)
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"colector arrancando"}`))
			return
		}
		if !ready.Load() {
			w.Header().Set("X-Katra-Watch", "stale")
		}
		_, _ = w.Write(body)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("starting"))
			return
		}
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("katra-watch: proba /state.json"))
	})
	server := &http.Server{Addr: cfg.Addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("no pude servir en %s: %v", cfg.Addr, err)
		}
	}()
	log.Printf("sirviendo en %s (state en %s, cada %s)", cfg.Addr, cfg.StatePath, cfg.Interval)
}

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	cfg := loadConfig()
	log.Printf("katra-watch v2 · proxy=%s proyecto=%s tenants=%d", cfg.ProxyURL, cfg.Project, len(cfg.Tenants))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var ready atomic.Bool
	serve(cfg, &ready)

	// Arranca con una corrida inmediata: un contenedor que acaba de levantarse no
	// debe esperar 5 minutos para publicar (y así el HUD no arranca en stale).
	for {
		snap := runChecks(cfg)
		if err := writeState(cfg.StatePath, snap); err != nil {
			log.Printf("no pude escribir %s: %v", cfg.StatePath, err)
		} else {
			ready.Store(true)
			logLine(snap)
		}
		select {
		case <-ctx.Done():
			log.Printf("cortando por señal")
			return
		case <-time.After(cfg.Interval):
		}
	}
}

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API_URL = "http://localhost:4000/api/order-history";
const OPCIONES_URL = "http://localhost:4000/api/order-history/opciones";

// Colores (hex directos: Recharts no resuelve var() en atributos SVG)
const COLORS = {
  accent: "#38bdf8",
  accentSoft: "rgba(56,189,248,0.14)",
  grid: "rgba(148,163,184,0.12)",
  axis: "#64748b",
  text2: "#9fb0c7",
  surface: "#151d2e",
  cat: ["#3987e5", "#199e70", "#c98500", "#9085e9", "#e66767"], // tipos de customer
};

const MESES = [
  { valor: "01", nombre: "Enero" },
  { valor: "02", nombre: "Febrero" },
  { valor: "03", nombre: "Marzo" },
  { valor: "04", nombre: "Abril" },
  { valor: "05", nombre: "Mayo" },
  { valor: "06", nombre: "Junio" },
  { valor: "07", nombre: "Julio" },
  { valor: "08", nombre: "Agosto" },
  { valor: "09", nombre: "Septiembre" },
  { valor: "10", nombre: "Octubre" },
  { valor: "11", nombre: "Noviembre" },
  { valor: "12", nombre: "Diciembre" },
];
const MES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [];
for (let a = ANIO_ACTUAL; a >= 2024; a--) ANIOS.push(String(a));

const fmt = (n) => Number(n || 0).toLocaleString("es-AR");
const formatMes = (mes) => {
  // "2026-07" -> "jul '26"
  const [anio, m] = String(mes).split("-");
  return `${MES_ABBR[Number(m) - 1] ?? m} '${anio.slice(2)}`;
};

const METRICAS = [
  { valor: "ordenes", label: "Órdenes" },
  { valor: "unidades", label: "Unidades" },
];

export default function App() {
  const [porMarca, setPorMarca] = useState([]);
  const [porTipoCustomer, setPorTipoCustomer] = useState([]);
  const [serieMensual, setSerieMensual] = useState([]);
  const [kpis, setKpis] = useState(null);

  const [marcas, setMarcas] = useState(["Todas"]);
  const [customers, setCustomers] = useState(["Todos"]);
  const [tiposCustomer, setTiposCustomer] = useState(["Todos"]);

  const [marcaFiltro, setMarcaFiltro] = useState("Todas");
  const [customerFiltro, setCustomerFiltro] = useState("Todos");
  const [tipoCustomerFiltro, setTipoCustomerFiltro] = useState("Todos");
  const [mesFiltro, setMesFiltro] = useState("Todos");
  const [anioFiltro, setAnioFiltro] = useState("Todos");
  const [metrica, setMetrica] = useState("ordenes");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  // Opciones de los selectores: se piden una vez.
  useEffect(() => {
    fetch(OPCIONES_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Error al conectar con el backend");
        return res.json();
      })
      .then((json) => {
        setMarcas(["Todas", ...json.marcas]);
        setCustomers(["Todos", ...json.customers]);
        setTiposCustomer(["Todos", ...json.tiposCustomer]);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Datos del dashboard: se re-consultan al cambiar cualquier filtro.
  useEffect(() => {
    setLoading(true);

    const params = new URLSearchParams();
    if (marcaFiltro !== "Todas") params.set("marca", marcaFiltro);
    if (customerFiltro !== "Todos") params.set("customer", customerFiltro);
    if (tipoCustomerFiltro !== "Todos") params.set("tipoCustomer", tipoCustomerFiltro);

    if (anioFiltro !== "Todos" && mesFiltro !== "Todos") {
      params.set("mes", `${anioFiltro}-${mesFiltro}`);
    } else if (anioFiltro !== "Todos") {
      params.set("desde", `${anioFiltro}-01-01`);
      params.set("hasta", `${anioFiltro}-12-31`);
    }

    const qs = params.toString();
    const url = qs ? `${API_URL}?${qs}` : API_URL;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Error al conectar con el backend");
        return res.json();
      })
      .then((json) => {
        setPorMarca(json.data || []);
        setPorTipoCustomer(json.porTipoCustomer || []);
        setSerieMensual(json.serieMensual || []);
        setKpis(json.kpis || null);
        setFetchedAt(json.fetchedAt);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [marcaFiltro, customerFiltro, tipoCustomerFiltro, mesFiltro, anioFiltro]);

  const metricaLabel = METRICAS.find((m) => m.valor === metrica)?.label ?? "";

  const topMarcas = [...porMarca]
    .sort((a, b) => b[metrica] - a[metrica])
    .slice(0, 10)
    .reverse(); // reverse: en barra horizontal el mayor queda arriba

  const tipoCustomerData = [...porTipoCustomer].sort((a, b) => b[metrica] - a[metrica]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>
              <span style={styles.titleDot} /> Previsibilidad de volumen — 5411
            </h1>
            <p style={styles.subtitle}>
              Operación 3PL · Order History
              {fetchedAt && ` · datos al ${new Date(fetchedAt).toLocaleString("es-AR")}`}
            </p>
          </div>
          <MetricToggle value={metrica} onChange={setMetrica} />
        </header>

        {error && (
          <div style={styles.errorBox}>
            No se pudo conectar con el backend: {error}. ¿Está corriendo <code>npm run dev</code> en /backend?
          </div>
        )}

        {!error && (
          <>
            {/* Filtros */}
            <div style={styles.filters}>
              <Filtro label="Marca" value={marcaFiltro} onChange={setMarcaFiltro} options={marcas} />
              <Filtro label="Customer" value={customerFiltro} onChange={setCustomerFiltro} options={customers} />
              <Filtro
                label="Tipo de customer"
                value={tipoCustomerFiltro}
                onChange={setTipoCustomerFiltro}
                options={tiposCustomer}
              />
              <Filtro
                label="Mes"
                value={mesFiltro}
                onChange={setMesFiltro}
                options={["Todos", ...MESES.map((m) => m.valor)]}
                render={(v) => (v === "Todos" ? "Todos" : MESES.find((m) => m.valor === v)?.nombre)}
              />
              <Filtro label="Año" value={anioFiltro} onChange={setAnioFiltro} options={["Todos", ...ANIOS]} />
            </div>

            {loading || !kpis ? (
              <div style={styles.loading}>Cargando datos…</div>
            ) : (
              <>
                {/* KPIs */}
                <div style={styles.kpiGrid}>
                  <Kpi label="Órdenes totales" value={fmt(kpis.totalOrdenes)} accent />
                  <Kpi label="Unidades totales" value={fmt(kpis.totalUnidades)} />
                  <Kpi label="Unidades por orden" value={kpis.unidadesPorOrden.toFixed(1)} />
                  <Kpi label="Marcas activas" value={fmt(kpis.cantidadMarcas)} />
                  <Kpi label="Customers activos" value={fmt(kpis.cantidadCustomers)} />
                </div>

                {/* Charts */}
                <div style={styles.chartGrid}>
                  <Card title={`${metricaLabel} por mes`} subtitle="Tendencia — base para previsibilidad" wide>
                    {serieMensual.length === 0 ? (
                      <Empty />
                    ) : (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={serieMensual} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gAccent" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={COLORS.grid} vertical={false} />
                          <XAxis
                            dataKey="mes"
                            tickFormatter={formatMes}
                            tick={{ fill: COLORS.axis, fontSize: 12 }}
                            axisLine={{ stroke: COLORS.grid }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: COLORS.axis, fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={52}
                            tickFormatter={fmt}
                          />
                          <Tooltip content={<TT metricaLabel={metricaLabel} labelFn={formatMes} />} />
                          <Area
                            type="monotone"
                            dataKey={metrica}
                            stroke={COLORS.accent}
                            strokeWidth={2}
                            fill="url(#gAccent)"
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            name={metricaLabel}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </Card>

                  <Card title={`Top marcas por ${metricaLabel.toLowerCase()}`} subtitle="10 marcas con mayor volumen">
                    {topMarcas.length === 0 ? (
                      <Empty />
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                          data={topMarcas}
                          layout="vertical"
                          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        >
                          <CartesianGrid stroke={COLORS.grid} horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fill: COLORS.axis, fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={fmt}
                          />
                          <YAxis
                            type="category"
                            dataKey="marca"
                            tick={{ fill: COLORS.text2, fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={120}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            content={<TT metricaLabel={metricaLabel} />}
                          />
                          <Bar dataKey={metrica} fill={COLORS.accent} radius={[0, 4, 4, 0]} name={metricaLabel} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </Card>

                  <Card title={`${metricaLabel} por tipo de customer`} subtitle="Majors · Boutiques · Ecommerce">
                    {tipoCustomerData.length === 0 ? (
                      <Empty />
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={tipoCustomerData}
                            dataKey={metrica}
                            nameKey="tipoCustomer"
                            cx="50%"
                            cy="50%"
                            innerRadius={62}
                            outerRadius={100}
                            paddingAngle={2}
                            stroke={COLORS.surface}
                            strokeWidth={2}
                          >
                            {tipoCustomerData.map((_, i) => (
                              <Cell key={i} fill={COLORS.cat[i % COLORS.cat.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<TT metricaLabel={metricaLabel} nameKey="tipoCustomer" />} />
                          <Legend
                            iconType="circle"
                            wrapperStyle={{ fontSize: 12, color: COLORS.text2 }}
                            formatter={(v) => <span style={{ color: COLORS.text2 }}>{v}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </Card>

                  <SlaPlaceholder />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Componentes ---------- */

function MetricToggle({ value, onChange }) {
  return (
    <div style={styles.toggle}>
      {METRICAS.map((m) => {
        const activo = m.valor === value;
        return (
          <button
            key={m.valor}
            onClick={() => onChange(m.valor)}
            style={{ ...styles.toggleBtn, ...(activo ? styles.toggleBtnActive : {}) }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function Filtro({ label, value, onChange, options, render }) {
  return (
    <label style={styles.filtro}>
      <span style={styles.filtroLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div style={{ ...styles.kpi, ...(accent ? styles.kpiAccent : {}) }}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, ...(accent ? { color: COLORS.accent } : {}) }}>{value}</div>
    </div>
  );
}

function Card({ title, subtitle, children, wide }) {
  return (
    <div style={{ ...styles.card, ...(wide ? styles.cardWide : {}) }}>
      <div style={styles.cardHead}>
        <div style={styles.cardTitle}>{title}</div>
        {subtitle && <div style={styles.cardSubtitle}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div style={styles.empty}>Sin datos para los filtros seleccionados</div>;
}

// Tooltip oscuro reutilizable
function TT({ active, payload, label, metricaLabel, labelFn, nameKey }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const titulo = nameKey ? p.payload[nameKey] : labelFn ? labelFn(label) : label;
  return (
    <div style={styles.tooltip}>
      <div style={styles.tooltipTitle}>{titulo}</div>
      <div style={styles.tooltipRow}>
        <span style={{ ...styles.tooltipDot, background: p.color || COLORS.accent }} />
        {metricaLabel}: <b style={{ marginLeft: 4 }}>{fmt(p.value)}</b>
      </div>
    </div>
  );
}

// Panel SLA — placeholder hasta conectar la fecha de fin de orden
function SlaPlaceholder() {
  return (
    <div style={{ ...styles.card, position: "relative", overflow: "hidden" }}>
      <div style={styles.cardHead}>
        <div style={styles.cardTitle}>
          SLA / Lead time <span style={styles.badge}>Próximamente</span>
        </div>
        <div style={styles.cardSubtitle}>Tiempo promedio por orden (demo)</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: 0.55 }}>
        {/* Gauge de muestra (sin datos reales) */}
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="56" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="14" />
          <circle
            cx="70"
            cy="70"
            r="56"
            fill="none"
            stroke={COLORS.accent}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 56}`}
            strokeDashoffset={`${2 * Math.PI * 56 * 0.32}`}
            transform="rotate(-90 70 70)"
          />
          <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill={COLORS.text2}>
            — d
          </text>
          <text x="70" y="88" textAnchor="middle" fontSize="11" fill={COLORS.axis}>
            lead time
          </text>
        </svg>

        <div style={{ flex: 1 }}>
          {[70, 90, 55].map((w, i) => (
            <div key={i} style={{ ...styles.skeleton, width: `${w}%` }} />
          ))}
          <p style={{ color: COLORS.axis, fontSize: 12, margin: "12px 0 0", lineHeight: 1.5 }}>
            Lorem ipsum — se calculará con la fecha de inicio (Start Date) y la fecha de despacho/entrega
            de cada orden. Las órdenes aún no despachadas quedan fuera del promedio.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Estilos ---------- */

const styles = {
  page: { minHeight: "100vh", padding: "28px 20px 60px" },
  container: { maxWidth: 1180, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 22,
  },
  title: { fontSize: 22, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 10 },
  titleDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: COLORS.accent,
    boxShadow: `0 0 12px ${COLORS.accent}`,
  },
  subtitle: { color: "var(--text-2)", fontSize: 13, margin: "6px 0 0" },
  toggle: {
    display: "inline-flex",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: {
    border: "none",
    background: "transparent",
    color: "var(--text-2)",
    padding: "7px 16px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  toggleBtnActive: { background: COLORS.accentSoft, color: COLORS.accent },
  filters: { display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 22 },
  filtro: { display: "flex", flexDirection: "column", gap: 5 },
  filtroLabel: { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  kpi: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "16px 18px",
  },
  kpiAccent: { borderColor: "var(--accent-line)", boxShadow: "0 0 0 1px rgba(56,189,248,0.08)" },
  kpiLabel: { fontSize: 12, color: "var(--text-2)", marginBottom: 8 },
  kpiValue: { fontSize: 28, fontWeight: 700, lineHeight: 1 },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16,
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "18px 18px 12px",
  },
  cardWide: { gridColumn: "1 / -1" },
  cardHead: { marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 },
  cardSubtitle: { fontSize: 12, color: "var(--muted)", marginTop: 3 },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COLORS.accent,
    background: COLORS.accentSoft,
    border: "1px solid var(--accent-line)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  empty: { color: "var(--muted)", fontSize: 13, padding: "60px 0", textAlign: "center" },
  loading: { color: "var(--text-2)", fontSize: 14, padding: "80px 0", textAlign: "center" },
  errorBox: {
    background: "rgba(214,60,60,0.12)",
    border: "1px solid rgba(214,60,60,0.4)",
    color: "#f7b6b6",
    borderRadius: 12,
    padding: "14px 16px",
    fontSize: 14,
  },
  tooltip: {
    background: "#0f1626",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    color: "var(--text)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  tooltipTitle: { fontWeight: 600, marginBottom: 5 },
  tooltipRow: { display: "flex", alignItems: "center", color: "var(--text-2)" },
  tooltipDot: { width: 9, height: 9, borderRadius: "50%", marginRight: 7, display: "inline-block" },
  skeleton: {
    height: 10,
    borderRadius: 6,
    background: "linear-gradient(90deg, rgba(148,163,184,0.18), rgba(148,163,184,0.06))",
    marginBottom: 10,
  },
};

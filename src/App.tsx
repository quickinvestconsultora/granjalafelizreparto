import { supabase } from "./lib/supabase";
import { useEffect, useMemo, useState } from "react";
import logo from "./assets/logo.png";
import AuthGate from "./AuthGate";

type TipoHuevo = "" | "B1" | "B2" | "B3" | "C1" | "EXT" | "CC" | "CP";
type TipoMovimiento = "venta" | "deuda" | "pago";

type Movimiento = {
  id: string;
  fecha: string;
  cliente: string;
  cantidad: number;
  tipoHuevo: TipoHuevo;
  tipoMovimiento: TipoMovimiento;
  valor: number;
  efectivo: number;
  transferencia: number;
  saldoImpacto: number;
  nota: string;
  userId?: string;
};

type Cliente = {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  saldo: number;
};

type StockItem = {
  tipo: Exclude<TipoHuevo, "">;
  inicial: number;
  carga: number;
};

type HistorialDia = {
  id: string;
  fecha: string;
  movimientos: Movimiento[];
  stock: StockItem[];
  reparto: RepartoItem[];
  guardadoEn: string;
};

type RepartoItem = {
  id: string;
  nombre: string;
  direccion: string;
  fecha: string;
  userId?: string;
};

type ClienteForm = {
  nombre: string;
  direccion: string;
  telefono: string;
};

type MovimientoForm = {
  cliente: string;
  cantidad: string;
  tipoHuevo: TipoHuevo;
  valor: string;
  efectivo: string;
  transferencia: string;
  cuentaCorriente: string;
  nota: string;
};

type StockCalculadoItem = StockItem & {
  ventas: number;
  final: number;
};

type UsuarioResumen = {
  id: string;
  email: string;
};

const MAIN_USER_ID = "0e79e966-d77b-4479-bec3-077a729e9563";
const TIPOS: Exclude<TipoHuevo, "">[] = ["B1", "B2", "B3", "C1", "EXT", "CC", "CP"];

const emptyCliente: ClienteForm = {
  nombre: "",
  direccion: "",
  telefono: "",
};

const emptyMovimiento: MovimientoForm = {
  cliente: "",
  cantidad: "",
  tipoHuevo: "",
  valor: "",
  efectivo: "",
  transferencia: "",
  cuentaCorriente: "",
  nota: "",
};

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(";"),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? "";
          const normalized = String(value).replace(/"/g, '""');
          return `"${normalized}"`;
        })
        .join(";"),
    ),
  ];

  const csvContent = "\uFEFF" + csvLines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function createInitialStock(): StockItem[] {
  return TIPOS.map((tipo) => ({ tipo, inicial: 0, carga: 0 }));
}

function normalizeStockRows(rows: Partial<StockItem>[]): StockItem[] {
  return TIPOS.map((tipo) => {
    const found = rows.find((r) => r.tipo === tipo);
    return {
      tipo,
      inicial: Number(found?.inicial ?? 0),
      carga: Number(found?.carga ?? 0),
    };
  });
}

function calcularFinalStock(item: StockItem, movimientosDelDia: Movimiento[]): number {
  const ventas = movimientosDelDia
    .filter((m) => m.tipoMovimiento === "venta" && m.tipoHuevo === item.tipo)
    .reduce((acc, m) => acc + Number(m.cantidad || 0), 0);

  return Number(item.inicial || 0) + Number(item.carga || 0) - ventas;
}

function inputClass(): string {
  return "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500";
}

function buttonClass(primary = false): string {
  return primary
    ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
    : "rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50";
}

function cardClass(): string {
  return "rounded-2xl border border-slate-200 bg-white shadow-sm";
}

function tabClass(active: boolean): string {
  return active
    ? "rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700";
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
      <div className="text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"reparto" | "carga" | "movimientos" | "stock" | "historial" | "clientes">("reparto");

  const [userId, setUserId] = useState<string | null>(null);
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [usuariosDisponibles, setUsuariosDisponibles] = useState<UsuarioResumen[]>([]);
  const [usuarioVistaId, setUsuarioVistaId] = useState<string | null>(null);
  const [stockListo, setStockListo] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [stock, setStock] = useState<StockItem[]>(createInitialStock());
  const [historial, setHistorial] = useState<HistorialDia[]>([]);
  const [reparto, setReparto] = useState<RepartoItem[]>([]);

  const [movForm, setMovForm] = useState<MovimientoForm>(emptyMovimiento);
  const [clienteForm, setClienteForm] = useState<ClienteForm>(emptyCliente);

  const [mensaje, setMensaje] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [clienteEditandoId, setClienteEditandoId] = useState<string | null>(null);
  const [movimientoEditandoId, setMovimientoEditandoId] = useState<string | null>(null);
  const [mostrarClienteForm, setMostrarClienteForm] = useState(false);
  const [historialSeleccionadoId, setHistorialSeleccionadoId] = useState<string | null>(null);
  const [repartoTexto, setRepartoTexto] = useState("");

  const userScopeId = esPrincipal ? usuarioVistaId ?? userId : userId;
  const historialStorageKey = userScopeId ? `granja_pro_historial_${userScopeId}` : "granja_pro_historial_anon";

  async function cargarUsuariosParaAdmin() {
    const { data, error } = await supabase
      .from("movimientos")
      .select("user_id")
      .not("user_id", "is", null);

    if (error) {
      console.error("Error cargando usuarios disponibles:", error);
      return;
    }

    const ids = Array.from(new Set((data ?? []).map((x) => String(x.user_id)).filter(Boolean)));
    setUsuariosDisponibles(ids.map((id) => ({ id, email: id === MAIN_USER_ID ? "Principal" : id })));
  }

  async function cargarClientes() {
    const { data: clientesData, error: clientesError } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre", { ascending: true });

    if (clientesError) {
      console.error("Error cargando clientes:", clientesError);
      return;
    }

    setClientes(
      (clientesData ?? []).map((c) => ({
        id: String(c.id),
        nombre: c.nombre ?? "",
        direccion: c.direccion ?? "",
        telefono: c.telefono ? String(c.telefono) : "",
        saldo: Number(c.saldo ?? 0),
      })),
    );
  }

  async function cargarMovimientos(currentUserId: string, principal: boolean) {
    let query = supabase.from("movimientos").select("*").order("created_at", { ascending: false });

    if (!principal) {
      query = query.eq("user_id", currentUserId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error cargando movimientos:", error);
      return;
    }

    setMovimientos(
      (data ?? []).map((m) => ({
        id: String(m.id),
        fecha: m.fecha,
        cliente: m.cliente,
        cantidad: Number(m.cantidad ?? 0),
        tipoHuevo: (m.tipo_huevo ?? "") as TipoHuevo,
        tipoMovimiento: m.tipo_movimiento as TipoMovimiento,
        valor: Number(m.valor ?? 0),
        efectivo: Number(m.efectivo ?? 0),
        transferencia: Number(m.transferencia ?? 0),
        saldoImpacto: Number(m.saldo_impacto ?? 0),
        nota: m.nota ?? "",
        userId: m.user_id ? String(m.user_id) : undefined,
      })),
    );
  }

  async function cargarStockDesdeSupabase(fecha: string, currentUserId: string): Promise<StockItem[]> {
    const { data: stockHoy, error: stockHoyError } = await supabase
      .from("stock_diario")
      .select("tipo, inicial, carga")
      .eq("fecha", fecha)
      .eq("user_id", currentUserId);

    if (stockHoyError) {
      console.error("Error cargando stock de hoy:", stockHoyError);
      return createInitialStock();
    }

    if (stockHoy && stockHoy.length > 0) {
      return normalizeStockRows(stockHoy as Partial<StockItem>[]);
    }

    const { data: ultimaFechaData, error: ultimaFechaError } = await supabase
      .from("stock_diario")
      .select("fecha")
      .eq("user_id", currentUserId)
      .lt("fecha", fecha)
      .order("fecha", { ascending: false })
      .limit(1);

    if (ultimaFechaError) {
      console.error("Error buscando última fecha de stock:", ultimaFechaError);
      return createInitialStock();
    }

    const ultimaFecha = ultimaFechaData?.[0]?.fecha;

    if (!ultimaFecha) {
      const stockInicial = createInitialStock();

      const { error: insertInicialError } = await supabase.from("stock_diario").upsert(
        stockInicial.map((s) => ({
          user_id: currentUserId,
          fecha,
          tipo: s.tipo,
          inicial: s.inicial,
          carga: s.carga,
          final: s.inicial + s.carga,
        })),
        { onConflict: "user_id,fecha,tipo" },
      );

      if (insertInicialError) {
        console.error("Error creando stock inicial base:", insertInicialError);
      }

      return stockInicial;
    }

    const { data: stockAnterior, error: stockAnteriorError } = await supabase
      .from("stock_diario")
      .select("tipo, final")
      .eq("user_id", currentUserId)
      .eq("fecha", ultimaFecha);

    if (stockAnteriorError) {
      console.error("Error cargando stock anterior:", stockAnteriorError);
      return createInitialStock();
    }

    const stockNuevo = TIPOS.map((tipo) => {
      const anterior = stockAnterior?.find((s) => s.tipo === tipo);
      return {
        tipo,
        inicial: Number(anterior?.final ?? 0),
        carga: 0,
      };
    });

    const { error: insertError } = await supabase.from("stock_diario").upsert(
      stockNuevo.map((s) => ({
        user_id: currentUserId,
        fecha,
        tipo: s.tipo,
        inicial: s.inicial,
        carga: s.carga,
        final: s.inicial,
      })),
      { onConflict: "user_id,fecha,tipo" },
    );

    if (insertError) {
      console.error("Error creando stock inicial del día:", insertError);
    }

    return stockNuevo;
  }

  async function persistirStockDelDia(
    fecha: string,
    stockActual: StockItem[],
    movimientosActuales: Movimiento[],
    currentUserId: string,
  ) {
    const movimientosDelDia = movimientosActuales.filter(
      (m) => m.fecha === fecha && (!m.userId || m.userId === currentUserId),
    );

    const rows = stockActual.map((s) => ({
      user_id: currentUserId,
      fecha,
      tipo: s.tipo,
      inicial: Number(s.inicial || 0),
      carga: Number(s.carga || 0),
      final: calcularFinalStock(s, movimientosDelDia),
    }));

    const { error } = await supabase.from("stock_diario").upsert(rows, { onConflict: "user_id,fecha,tipo" });

    if (error) {
      console.error("Error guardando stock diario:", error);
    }
  }

  async function cargarReparto(fecha: string, currentUserId: string) {
    const { data, error } = await supabase
      .from("reparto")
      .select("*")
      .eq("user_id", currentUserId)
      .eq("fecha", fecha)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error cargando reparto:", error);
      return;
    }

    setReparto(
      (data ?? []).map((r) => ({
        id: String(r.id),
        nombre: r.nombre ?? "",
        direccion: r.direccion ?? "",
        fecha: r.fecha,
        userId: r.user_id ? String(r.user_id) : undefined,
      })),
    );
  }

  useEffect(() => {
    async function cargarDatosIniciales() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("No se pudo obtener el usuario:", userError);
        return;
      }

      const currentUserId = user.id;
      const principal = currentUserId === MAIN_USER_ID;

      setUserId(currentUserId);
      setEsPrincipal(principal);
      setUsuarioVistaId(currentUserId);

      await cargarClientes();
      await cargarMovimientos(currentUserId, principal);

      if (principal) {
        await cargarUsuariosParaAdmin();
      }
    }

    void cargarDatosIniciales();
  }, []);

  useEffect(() => {
    async function cargarVistaUsuario() {
      if (!userScopeId) return;

      setStockListo(false);
      const fechaHoy = today();
      await cargarReparto(fechaHoy, userScopeId);
      const stockSupabase = await cargarStockDesdeSupabase(fechaHoy, userScopeId);
      setStock(stockSupabase);
      setHistorial(load(`granja_pro_historial_${userScopeId}`, []));
      setStockListo(true);
    }

    void cargarVistaUsuario();
  }, [userScopeId]);

  useEffect(() => {
    if (!userScopeId) return;
    save(historialStorageKey, historial);
  }, [historial, historialStorageKey, userScopeId]);

  useEffect(() => {
    if (!stockListo || !userScopeId) return;
    void persistirStockDelDia(today(), stock, movimientos, userScopeId);
  }, [stock, movimientos, stockListo, userScopeId]);

  const valorNum = Number(movForm.valor || 0);
  const efectivoNum = Number(movForm.efectivo || 0);
  const transferenciaNum = Number(movForm.transferencia || 0);
  const cantidadNum = Number(movForm.cantidad || 0);
  const ajusteCCNum = Number(movForm.cuentaCorriente || 0);

  const pagoTotal = efectivoNum + transferenciaNum;
  const debePreview = Math.max(valorNum - pagoTotal, 0);
  const saldoFavorPreview =
    valorNum === 0 ? pagoTotal + ajusteCCNum : Math.max(pagoTotal - valorNum, 0) + ajusteCCNum;

  const tipoMovimiento: TipoMovimiento =
    valorNum === 0 && pagoTotal > 0
      ? "pago"
      : valorNum > 0 && pagoTotal === 0 && cantidadNum === 0 && !movForm.tipoHuevo
        ? "deuda"
        : "venta";

  const movimientosBase = useMemo(() => {
    if (!esPrincipal || !usuarioVistaId) return movimientos;
    return movimientos.filter((m) => m.userId === usuarioVistaId);
  }, [movimientos, esPrincipal, usuarioVistaId]);

  const movimientosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return movimientosBase.filter((m) => {
      const okText =
        !q || [m.cliente, m.tipoHuevo, m.tipoMovimiento, m.fecha, m.nota].join(" ").toLowerCase().includes(q);
      const okDate = !fechaFiltro || m.fecha === fechaFiltro;
      return okText && okDate;
    });
  }, [movimientosBase, busqueda, fechaFiltro]);

  const sugerenciasClientes = useMemo(() => {
    const q = movForm.cliente.toLowerCase().trim();
    if (!q) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q)).slice(0, 5);
  }, [clientes, movForm.cliente]);

  const sugerenciasReparto = useMemo(() => {
    const q = repartoTexto.toLowerCase().trim();
    if (!q) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q)).slice(0, 5);
  }, [clientes, repartoTexto]);

  const stockCalculado = useMemo<StockCalculadoItem[]>(() => {
    const fechaHoy = today();

    return stock.map((item) => {
      const ventas = movimientosBase
        .filter(
          (m) => m.fecha === fechaHoy && m.tipoMovimiento === "venta" && m.tipoHuevo === item.tipo,
        )
        .reduce((acc, m) => acc + Number(m.cantidad || 0), 0);

      return {
        ...item,
        ventas,
        final: Number(item.inicial || 0) + Number(item.carga || 0) - ventas,
      };
    });
  }, [stock, movimientosBase]);

  const totalDebe = movimientosFiltrados
    .filter((m) => m.saldoImpacto > 0)
    .reduce((acc, m) => acc + m.saldoImpacto, 0);

  const totalEfectivo = movimientosFiltrados.reduce((acc, m) => acc + m.efectivo, 0);
  const totalTransferencia = movimientosFiltrados.reduce((acc, m) => acc + m.transferencia, 0);
  const totalValor = movimientosFiltrados.reduce((acc, m) => acc + m.valor, 0);

  function flash(texto: string) {
    setMensaje(texto);
    window.setTimeout(() => setMensaje(""), 2200);
  }

  function limpiarMovimiento() {
    setMovForm(emptyMovimiento);
    setMovimientoEditandoId(null);
  }

  async function asegurarRepartoDelCliente(nombre: string) {
    if (!userScopeId) return;

    const cli = clientes.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
    const nombreFinal = cli?.nombre ?? nombre;

    if (reparto.some((r) => r.nombre.toLowerCase() === nombreFinal.toLowerCase() && r.fecha === today())) {
      return;
    }

    const { data, error } = await supabase
      .from("reparto")
      .insert({
        user_id: userScopeId,
        nombre: nombreFinal,
        direccion: cli?.direccion || "Sin dirección",
        fecha: today(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error agregando a reparto:", error);
      return;
    }

    const nuevo: RepartoItem = {
      id: String(data.id),
      nombre: data.nombre ?? "",
      direccion: data.direccion ?? "",
      fecha: data.fecha,
      userId: data.user_id ? String(data.user_id) : undefined,
    };

    setReparto((prev) => [...prev, nuevo]);
  }

  async function guardarMovimiento() {
    if (!userId) return flash("No se encontró el usuario logueado.");

    const cliente = movForm.cliente.trim();
    async function asegurarClienteExiste(nombreRaw: string) {
  const nombre = nombreRaw.trim();
  if (!nombre) return false;

  const existente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase(),
  );

  if (existente) return true;

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre,
      direccion: "",
      telefono: "",
      saldo: 0,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creando cliente automáticamente:", error);
    flash("No se pudo crear el cliente automáticamente.");
    return false;
  }

  const clienteNuevo: Cliente = {
    id: String(data.id),
    nombre: data.nombre ?? "",
    direccion: data.direccion ?? "",
    telefono: data.telefono ? String(data.telefono) : "",
    saldo: Number(data.saldo ?? 0),
  };

  setClientes((prev) => [clienteNuevo, ...prev]);
  return true;
}

    if (!cliente) return flash("Ingresá un cliente.");
    if (valorNum === 0 && pagoTotal === 0) return flash("Ingresá un valor o un pago.");

    if (tipoMovimiento === "pago" && (cantidadNum > 0 || !!movForm.tipoHuevo)) {
      return flash("Si es pago, no cargues cantidad ni tipo.");
    }

    const saldoImpacto =
      tipoMovimiento === "pago"
        ? -saldoFavorPreview
        : debePreview - Math.max(pagoTotal - valorNum, 0) - ajusteCCNum;

    const payload = {
      user_id: userId,
      fecha: today(),
      cliente,
      cantidad: tipoMovimiento === "pago" ? 0 : cantidadNum,
      tipo_huevo: tipoMovimiento === "pago" || tipoMovimiento === "deuda" ? null : movForm.tipoHuevo,
      tipo_movimiento: tipoMovimiento,
      valor: valorNum,
      efectivo: efectivoNum,
      transferencia: transferenciaNum,
      saldo_impacto: saldoImpacto,
      nota: movForm.nota.trim(),
    };

    if (movimientoEditandoId) {
      const { data, error } = await supabase
        .from("movimientos")
        .update(payload)
        .eq("id", Number(movimientoEditandoId))
        .select()
        .single();

      if (error) {
        console.error(error);
        return flash("No se pudo actualizar el movimiento.");
      }

      const movimientoActualizado: Movimiento = {
        id: String(data.id),
        fecha: data.fecha,
        cliente: data.cliente,
        cantidad: Number(data.cantidad ?? 0),
        tipoHuevo: (data.tipo_huevo ?? "") as TipoHuevo,
        tipoMovimiento: data.tipo_movimiento as TipoMovimiento,
        valor: Number(data.valor ?? 0),
        efectivo: Number(data.efectivo ?? 0),
        transferencia: Number(data.transferencia ?? 0),
        saldoImpacto: Number(data.saldo_impacto ?? 0),
        nota: data.nota ?? "",
        userId: data.user_id ? String(data.user_id) : undefined,
      };

      setMovimientos((prev) => prev.map((m) => (m.id === movimientoEditandoId ? movimientoActualizado : m)));
      await cargarClientes();
      if (tipoMovimiento !== "pago") await asegurarRepartoDelCliente(cliente);
      limpiarMovimiento();
      return flash("Movimiento actualizado.");
    }

    const { data, error } = await supabase.from("movimientos").insert(payload).select().single();

    if (error) {
      console.error(error);
      return flash("No se pudo guardar el movimiento.");
    }

    const movimientoNuevo: Movimiento = {
      id: String(data.id),
      fecha: data.fecha,
      cliente: data.cliente,
      cantidad: Number(data.cantidad ?? 0),
      tipoHuevo: (data.tipo_huevo ?? "") as TipoHuevo,
      tipoMovimiento: data.tipo_movimiento as TipoMovimiento,
      valor: Number(data.valor ?? 0),
      efectivo: Number(data.efectivo ?? 0),
      transferencia: Number(data.transferencia ?? 0),
      saldoImpacto: Number(data.saldo_impacto ?? 0),
      nota: data.nota ?? "",
      userId: data.user_id ? String(data.user_id) : undefined,
    };

    setMovimientos((prev) => [movimientoNuevo, ...prev]);
    await cargarClientes();
    if (tipoMovimiento !== "pago") await asegurarRepartoDelCliente(cliente);
    limpiarMovimiento();
    flash("Movimiento guardado.");
  }

  function editarMovimiento(m: Movimiento) {
    if (esPrincipal && m.userId !== userId) {
      flash("Como principal podés ver todo, pero cada usuario edita sus propios movimientos.");
      return;
    }

    setMovimientoEditandoId(m.id);
    setMovForm({
      cliente: m.cliente,
      cantidad: m.cantidad ? String(m.cantidad) : "",
      tipoHuevo: m.tipoHuevo,
      valor: m.valor ? String(m.valor) : "",
      efectivo: m.efectivo ? String(m.efectivo) : "",
      transferencia: m.transferencia ? String(m.transferencia) : "",
      cuentaCorriente: "",
      nota: m.nota,
    });
    setTab("carga");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function borrarMovimiento(id: string) {
    const mov = movimientos.find((m) => m.id === id);
    if (!mov) return;

    if (esPrincipal && mov.userId !== userId) {
      return flash("Como principal podés ver todo, pero cada usuario borra sus propios movimientos.");
    }

    const { error } = await supabase.from("movimientos").delete().eq("id", Number(id));

    if (error) {
      console.error(error);
      return flash("No se pudo eliminar el movimiento.");
    }

    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    await cargarClientes();

    if (movimientoEditandoId === id) limpiarMovimiento();
    flash("Movimiento eliminado.");
  }

  async function guardarCliente() {
    const nombre = clienteForm.nombre.trim();
    if (!nombre) return flash("Ingresá un nombre.");

    if (clienteEditandoId) {
      const { error } = await supabase
        .from("clientes")
        .update({
          nombre,
          direccion: clienteForm.direccion.trim(),
          telefono: clienteForm.telefono.trim(),
        })
        .eq("id", clienteEditandoId);

      if (error) {
        console.error(error);
        return flash("No se pudo actualizar el cliente.");
      }

      setClientes((prev) =>
        prev.map((c) =>
          c.id === clienteEditandoId
            ? {
                ...c,
                nombre,
                direccion: clienteForm.direccion.trim(),
                telefono: clienteForm.telefono.trim(),
              }
            : c,
        ),
      );

      setClienteEditandoId(null);
      setClienteForm(emptyCliente);
      setMostrarClienteForm(false);
      return flash("Cliente actualizado.");
    }

    const existe = clientes.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe) return flash("Ese cliente ya existe.");

    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nombre,
        direccion: clienteForm.direccion.trim(),
        telefono: clienteForm.telefono.trim(),
        saldo: 0,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return flash("No se pudo guardar el cliente.");
    }

    const clienteNuevo: Cliente = {
      id: String(data.id),
      nombre: data.nombre ?? "",
      direccion: data.direccion ?? "",
      telefono: data.telefono ? String(data.telefono) : "",
      saldo: Number(data.saldo ?? 0),
    };

    setClientes((prev) => [clienteNuevo, ...prev]);
    setClienteForm(emptyCliente);
    setMostrarClienteForm(false);
    flash("Cliente agregado.");
  }

  function editarCliente(c: Cliente) {
    setClienteEditandoId(c.id);
    setClienteForm({
      nombre: c.nombre,
      direccion: c.direccion,
      telefono: c.telefono,
    });
    setMostrarClienteForm(true);
    setTab("clientes");
  }

  function abrirWhatsapp(c: Cliente) {
    let telefono = String(c.telefono || "").replace(/\D/g, "");
    if (!telefono) return flash("El cliente no tiene teléfono.");

    if (!telefono.startsWith("54")) telefono = `54${telefono}`;
    if (!telefono.startsWith("549")) telefono = telefono.replace(/^54/, "549");

    const texto =
      c.saldo > 0
        ? `Hola ${c.nombre}, su deuda es ${formatMoney(c.saldo)}`
        : c.saldo < 0
          ? `Hola ${c.nombre}, su saldo a favor es ${formatMoney(Math.abs(c.saldo))}`
          : `Hola ${c.nombre}, su saldo es 0`;

    window.location.href = `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
  }

  async function guardarDia() {
    if (!userScopeId) return flash("No hay usuario seleccionado para stock y reparto.");

    const fechaHoy = today();
    const movimientosDelDia = movimientosBase.filter((m) => m.fecha === fechaHoy);

    await persistirStockDelDia(fechaHoy, stock, movimientosBase, userScopeId);

    const dia: HistorialDia = {
      id: makeId(),
      fecha: fechaHoy,
      movimientos: movimientosDelDia,
      stock,
      reparto,
      guardadoEn: new Date().toISOString(),
    };

    setHistorial((prev) => [dia, ...prev]);
    limpiarMovimiento();

    flash("Día guardado. Mañana el stock inicial se cargará automáticamente con el final de hoy.");
  }

  async function agregarRepartoManual(nombreRaw?: string) {
    if (!userScopeId) return flash("No hay usuario seleccionado para reparto.");

    const nombre = (nombreRaw ?? repartoTexto).trim();
    if (!nombre) return flash("Ingresá un nombre para reparto.");

    const cli = clientes.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
    const nombreFinal = cli?.nombre ?? nombre;

    if (reparto.some((r) => r.nombre.toLowerCase() === nombreFinal.toLowerCase() && r.fecha === today())) {
      return flash("Ese cliente ya está en el reparto de hoy.");
    }

    const { data, error } = await supabase
      .from("reparto")
      .insert({
        user_id: userScopeId,
        nombre: nombreFinal,
        direccion: cli?.direccion || "Sin dirección",
        fecha: today(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error agregando reparto manual:", error);
      return flash("No se pudo agregar al reparto.");
    }

    const nuevo: RepartoItem = {
      id: String(data.id),
      nombre: data.nombre ?? "",
      direccion: data.direccion ?? "",
      fecha: data.fecha,
      userId: data.user_id ? String(data.user_id) : undefined,
    };

    setReparto((prev) => [...prev, nuevo]);
    setRepartoTexto("");
    flash("Agregado al reparto.");
  }

  async function quitarReparto(id: string) {
    const { error } = await supabase.from("reparto").delete().eq("id", Number(id));

    if (error) {
      console.error("Error quitando reparto:", error);
      return flash("No se pudo quitar del reparto.");
    }

    setReparto((prev) => prev.filter((r) => r.id !== id));
  }

  function exportarCSVMovimientos() {
    const rows = movimientosFiltrados.map((m) => ({
      Fecha: m.fecha,
      Cliente: m.cliente,
      Movimiento: m.tipoMovimiento,
      Cantidad: m.cantidad,
      Tipo: m.tipoHuevo || "",
      Valor: m.valor,
      Efectivo: m.efectivo,
      Transferencia: m.transferencia,
      Saldo: m.saldoImpacto,
      Nota: m.nota || "",
      Usuario: m.userId || "",
    }));
    downloadCsv(`movimientos-${today()}.csv`, rows);
  }

  function exportarCSVStock() {
    const rows = stockCalculado.map((s) => ({
      Tipo: s.tipo,
      Inicial: s.inicial,
      Carga: s.carga,
      Ventas: s.ventas,
      Final: s.final,
      Usuario: userScopeId || "",
    }));
    downloadCsv(`stock-${today()}.csv`, rows);
  }

  function exportarCSVReparto() {
    const rows = reparto.map((r, index) => ({
      Orden: index + 1,
      Fecha: r.fecha,
      Nombre: r.nombre,
      Direccion: r.direccion,
      Usuario: r.userId || userScopeId || "",
    }));
    downloadCsv(`reparto-${today()}.csv`, rows);
  }

  function exportarCSVHistorialDia(dia: HistorialDia) {
    const rows = dia.movimientos.map((m) => ({
      Fecha: m.fecha,
      Cliente: m.cliente,
      Movimiento: m.tipoMovimiento,
      Cantidad: m.cantidad,
      Tipo: m.tipoHuevo || "",
      Valor: m.valor,
      Efectivo: m.efectivo,
      Transferencia: m.transferencia,
      Saldo: m.saldoImpacto,
      Nota: m.nota || "",
      Usuario: m.userId || "",
    }));
    downloadCsv(`historial-${dia.fecha}.csv`, rows);
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className={`${cardClass()} p-5`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={logo}
                  alt="Logo Granja La Feliz"
                  className="h-16 w-16 rounded-2xl object-contain bg-white p-2 shadow-sm"
                />
                <div>
                  <h1 className="text-2xl font-bold">Granja La Feliz Reparto</h1>
                  <p className="text-sm text-slate-500">
                    Clientes compartidos, movimientos por usuario, saldo global y vista admin.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard title="Movimientos" value={movimientosFiltrados.length} />
                <StatCard title="Clientes" value={clientes.length} />
                <StatCard title="Debe" value={formatMoney(totalDebe)} />
                <StatCard title="Fecha" value={today()} />
              </div>
            </div>

            {esPrincipal && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Estás como usuario principal. Ves todos los movimientos, pero stock y reparto se muestran por usuario seleccionado.
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Usuario para stock y reparto</label>
                  <select
                    className={inputClass()}
                    value={usuarioVistaId ?? ""}
                    onChange={(e) => setUsuarioVistaId(e.target.value || null)}
                  >
                    {usuariosDisponibles.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {mensaje && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{mensaje}</div>}

          <div className="flex flex-wrap gap-2">
            <button className={tabClass(tab === "reparto")} onClick={() => setTab("reparto")}>
              Reparto
            </button>
            <button className={tabClass(tab === "carga")} onClick={() => setTab("carga")}>
              Carga
            </button>
            <button className={tabClass(tab === "movimientos")} onClick={() => setTab("movimientos")}>
              Movimientos
            </button>
            <button className={tabClass(tab === "stock")} onClick={() => setTab("stock")}>
              Stock
            </button>
            <button className={tabClass(tab === "historial")} onClick={() => setTab("historial")}>
              Historial
            </button>
            <button className={tabClass(tab === "clientes")} onClick={() => setTab("clientes")}>
              Clientes
            </button>
          </div>

          {tab === "reparto" && (
            <div className={`${cardClass()} p-5`}>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-semibold">Reparto del día</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-[260px]">
                    <input
                      className={inputClass()}
                      value={repartoTexto}
                      onChange={(e) => setRepartoTexto(e.target.value)}
                      placeholder="Agregar cliente o esporádico"
                    />
                    {sugerenciasReparto.length > 0 && repartoTexto.trim() && (
                      <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                        {sugerenciasReparto.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => agregarRepartoManual(c.nombre)}
                          >
                            {c.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className={buttonClass(true)} onClick={() => agregarRepartoManual()}>
                      Agregar reparto
                    </button>
                    <button className={buttonClass(false)} onClick={exportarCSVReparto}>
                      Exportar CSV
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {reparto.length === 0 && <div className="text-sm text-slate-500">Todavía no hay reparto cargado para hoy.</div>}

                {reparto.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="block w-full rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                    onClick={() => quitarReparto(r.id)}
                  >
                    <div className="font-semibold">{r.nombre}</div>
                    <div className="text-sm text-slate-500">{r.direccion}</div>
                    <div className="mt-1 text-xs text-slate-400">Tocar para quitar del reparto</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "carga" && (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className={`${cardClass()} p-5`}>
                <h2 className="mb-4 text-xl font-semibold">{movimientoEditandoId ? "Editar movimiento" : "Nuevo movimiento"}</h2>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="relative md:col-span-2">
                    <label className="mb-2 block text-sm">Cliente</label>
                    <input
                      className={inputClass()}
                      value={movForm.cliente}
                      onChange={(e) => setMovForm((p) => ({ ...p, cliente: e.target.value }))}
                      placeholder="Nombre del cliente"
                    />
                    {sugerenciasClientes.length > 0 && movForm.cliente.trim() && (
                      <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                        {sugerenciasClientes.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => setMovForm((p) => ({ ...p, cliente: c.nombre }))}
                          >
                            {c.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm">Cantidad</label>
                    <input
                      className={inputClass()}
                      type="number"
                      value={movForm.cantidad}
                      onChange={(e) => setMovForm((p) => ({ ...p, cantidad: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm">Tipo huevo</label>
                    <select
                      className={inputClass()}
                      value={movForm.tipoHuevo}
                      onChange={(e) => setMovForm((p) => ({ ...p, tipoHuevo: e.target.value as TipoHuevo }))}
                    >
                      <option value="">Sin tipo</option>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm">Valor</label>
                    <input
                      className={inputClass()}
                      type="number"
                      value={movForm.valor}
                      onChange={(e) => setMovForm((p) => ({ ...p, valor: e.target.value }))}
                      placeholder="Para venta o deuda"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm">Efectivo</label>
                    <input
                      className={inputClass()}
                      type="number"
                      value={movForm.efectivo}
                      onChange={(e) => setMovForm((p) => ({ ...p, efectivo: e.target.value }))}
                      placeholder="Para pago o venta"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm">Transferencia</label>
                    <input
                      className={inputClass()}
                      type="number"
                      value={movForm.transferencia}
                      onChange={(e) => setMovForm((p) => ({ ...p, transferencia: e.target.value }))}
                      placeholder="Para pago o venta"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm">Cuenta corriente</label>
                    <input
                      className={inputClass()}
                      type="number"
                      value={movForm.cuentaCorriente}
                      onChange={(e) => setMovForm((p) => ({ ...p, cuentaCorriente: e.target.value }))}
                      placeholder="Ajuste opcional"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm">Nota</label>
                    <input
                      className={inputClass()}
                      value={movForm.nota}
                      onChange={(e) => setMovForm((p) => ({ ...p, nota: e.target.value }))}
                      placeholder="Aclaración opcional"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
                  <div>
                    <strong>Tipo detectado:</strong> {tipoMovimiento}
                  </div>
                  <div>
                    <strong>Debe:</strong> {formatMoney(debePreview)}
                  </div>
                  <div>
                    <strong>Saldo a favor / pago:</strong> {formatMoney(saldoFavorPreview)}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={buttonClass(true)} onClick={guardarMovimiento}>
                    {movimientoEditandoId ? "Guardar cambios" : "Guardar movimiento"}
                  </button>
                  <button className={buttonClass(false)} onClick={limpiarMovimiento}>
                    Limpiar
                  </button>
                </div>
              </div>

              <div className={`${cardClass()} p-5`}>
                <h2 className="mb-4 text-xl font-semibold">Cómo usar</h2>
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-xl bg-slate-100 p-3">
                    <strong>Deuda:</strong> cliente + valor.
                  </div>
                  <div className="rounded-xl bg-slate-100 p-3">
                    <strong>Pago:</strong> cliente + efectivo y/o transferencia.
                  </div>
                  <div className="rounded-xl bg-slate-100 p-3">
                    <strong>Venta:</strong> valor + cantidad o tipo.
                  </div>
                  <div className="rounded-xl bg-slate-100 p-3">
                    Los clientes son compartidos, pero cada usuario guarda sus propios movimientos.
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "movimientos" && (
            <div className={`${cardClass()} p-5`}>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-semibold">Movimientos</h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className={inputClass()}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar cliente, fecha o movimiento"
                  />
                  <input
                    className={inputClass()}
                    type="date"
                    value={fechaFiltro}
                    onChange={(e) => setFechaFiltro(e.target.value)}
                  />
                  <button className={buttonClass(false)} onClick={() => setFechaFiltro("")}>
                    Limpiar
                  </button>
                  <button className={buttonClass(false)} onClick={exportarCSVMovimientos}>
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <StatCard title="Valor" value={formatMoney(totalValor)} />
                <StatCard title="Efectivo" value={formatMoney(totalEfectivo)} />
                <StatCard title="Transferencia" value={formatMoney(totalTransferencia)} />
                <StatCard title="Debe" value={formatMoney(totalDebe)} />
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-2 py-2">Fecha</th>
                      <th className="px-2 py-2">Cliente</th>
                      <th className="px-2 py-2">Movimiento</th>
                      <th className="px-2 py-2">Cant.</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Valor</th>
                      <th className="px-2 py-2">Efectivo</th>
                      <th className="px-2 py-2">Transferencia</th>
                      <th className="px-2 py-2">Saldo</th>
                      <th className="px-2 py-2">Nota</th>
                      <th className="px-2 py-2">Usuario</th>
                      <th className="px-2 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-2 py-8 text-center text-slate-500">
                          No hay movimientos.
                        </td>
                      </tr>
                    )}

                    {movimientosFiltrados.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100 align-top">
                        <td className="px-2 py-2">{m.fecha}</td>
                        <td className="px-2 py-2 font-medium">{m.cliente}</td>
                        <td className="px-2 py-2 capitalize">{m.tipoMovimiento}</td>
                        <td className="px-2 py-2">{m.cantidad || "-"}</td>
                        <td className="px-2 py-2">{m.tipoHuevo || "-"}</td>
                        <td className="px-2 py-2">{formatMoney(m.valor)}</td>
                        <td className="px-2 py-2">{formatMoney(m.efectivo)}</td>
                        <td className="px-2 py-2">{formatMoney(m.transferencia)}</td>
                        <td
                          className={`px-2 py-2 font-medium ${
                            m.saldoImpacto > 0 ? "text-red-600" : m.saldoImpacto < 0 ? "text-emerald-600" : "text-slate-700"
                          }`}
                        >
                          {formatMoney(m.saldoImpacto)}
                        </td>
                        <td className="px-2 py-2">{m.nota || "-"}</td>
                        <td className="px-2 py-2 text-xs text-slate-500">{m.userId || "-"}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <button className={buttonClass(false)} onClick={() => editarMovimiento(m)}>
                              Editar
                            </button>
                            <button className={buttonClass(false)} onClick={() => borrarMovimiento(m.id)}>
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "stock" && (
            <div className={`${cardClass()} p-5`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Stock</h2>
                <button className={buttonClass(false)} onClick={exportarCSVStock}>
                  Exportar CSV
                </button>
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Inicial</th>
                      <th className="px-2 py-2">Carga</th>
                      <th className="px-2 py-2">Ventas</th>
                      <th className="px-2 py-2">Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockCalculado.map((s) => (
                      <tr key={s.tipo} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-medium">{s.tipo}</td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass()}
                            type="number"
                            value={s.inicial}
                            onChange={(e) =>
                              setStock((prev) =>
                                prev.map((x) =>
                                  x.tipo === s.tipo ? { ...x, inicial: Number(e.target.value || 0) } : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass()}
                            type="number"
                            value={s.carga}
                            onChange={(e) =>
                              setStock((prev) =>
                                prev.map((x) =>
                                  x.tipo === s.tipo ? { ...x, carga: Number(e.target.value || 0) } : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2">{s.ventas}</td>
                        <td className="px-2 py-2 font-semibold">{s.final}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "historial" && (
            <div className={`${cardClass()} p-5`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Historial</h2>
                <button className={buttonClass(true)} onClick={guardarDia}>
                  Guardar día
                </button>
              </div>

              <div className="space-y-3">
                {historial.length === 0 && <div className="text-sm text-slate-500">Todavía no hay días guardados.</div>}

                {historial.map((h) => (
                  <div key={h.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{h.fecha}</div>
                        <div className="text-sm text-slate-500">Movimientos: {h.movimientos.length}</div>
                        <div className="text-sm text-slate-500">Reparto: {h.reparto.length}</div>
                        <div className="text-sm text-slate-500">Guardado: {new Date(h.guardadoEn).toLocaleString("es-AR")}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={buttonClass(false)}
                          onClick={() => setHistorialSeleccionadoId((prev) => (prev === h.id ? null : h.id))}
                        >
                          {historialSeleccionadoId === h.id ? "Ocultar detalle" : "Ver detalle"}
                        </button>
                        <button className={buttonClass(false)} onClick={() => exportarCSVHistorialDia(h)}>
                          Exportar CSV
                        </button>
                      </div>
                    </div>

                    {historialSeleccionadoId === h.id && (
                      <div className="mt-3 space-y-2 rounded-xl bg-slate-100 p-3 text-sm">
                        {h.movimientos.map((m) => (
                          <div key={m.id} className="border-b border-slate-200 py-2 last:border-b-0">
                            {m.cliente} · {m.tipoMovimiento} · {formatMoney(m.valor)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "clientes" && (
            <div className={`${cardClass()} p-5`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Clientes</h2>
                <button className={buttonClass(true)} onClick={() => setMostrarClienteForm((p) => !p)}>
                  {mostrarClienteForm ? "Cerrar" : "Agregar cliente"}
                </button>
              </div>

              {mostrarClienteForm && (
                <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3">
                  <input
                    className={inputClass()}
                    placeholder="Nombre"
                    value={clienteForm.nombre}
                    onChange={(e) => setClienteForm((p) => ({ ...p, nombre: e.target.value }))}
                  />
                  <input
                    className={inputClass()}
                    placeholder="Dirección"
                    value={clienteForm.direccion}
                    onChange={(e) => setClienteForm((p) => ({ ...p, direccion: e.target.value }))}
                  />
                  <input
                    className={inputClass()}
                    placeholder="Teléfono"
                    value={clienteForm.telefono}
                    onChange={(e) => setClienteForm((p) => ({ ...p, telefono: e.target.value }))}
                  />
                  <div className="md:col-span-3 flex gap-2">
                    <button className={buttonClass(true)} onClick={guardarCliente}>
                      {clienteEditandoId ? "Guardar cambios" : "Guardar cliente"}
                    </button>
                    {clienteEditandoId && (
                      <button
                        className={buttonClass(false)}
                        onClick={() => {
                          setClienteEditandoId(null);
                          setClienteForm(emptyCliente);
                          setMostrarClienteForm(false);
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {clientes.length === 0 && <div className="text-sm text-slate-500">Todavía no hay clientes cargados.</div>}

                {clientes.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{c.nombre}</div>
                        <div className="text-sm text-slate-500">{c.direccion || "Sin dirección"}</div>
                        <div className="text-sm text-slate-500">{c.telefono || "Sin teléfono"}</div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={`rounded-xl px-3 py-2 text-sm font-medium ${
                            c.saldo > 0 ? "bg-red-50 text-red-700" : c.saldo < 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.saldo > 0
                            ? `Deuda: ${formatMoney(c.saldo)}`
                            : c.saldo < 0
                              ? `Saldo a favor: ${formatMoney(Math.abs(c.saldo))}`
                              : `Saldo: ${formatMoney(0)}`}
                        </div>

                        <button className={buttonClass(false)} onClick={() => editarCliente(c)}>
                          Editar
                        </button>
                        <button className={buttonClass(false)} onClick={() => abrirWhatsapp(c)}>
                          WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}

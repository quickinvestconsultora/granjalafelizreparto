import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Download,
  MessageCircle,
  Pencil,
  PlusCircle,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";

type TipoHuevo = "B1" | "B2" | "B3" | "C1" | "EXT" | "CC" | "CP";
const TIPOS: TipoHuevo[] = ["B1", "B2", "B3", "C1", "EXT", "CC", "CP"];

type Venta = {
  id: string;
  fecha: string;
  cliente: string;
  cantidad: number;
  tipo: TipoHuevo;
  valor: number;
  efectivo: number;
  transferencia: number;
  aclaracionTransferencia: string;
  debe: number;
  cuentaCorriente: number;
  createdAt: string;
};

type Cliente = {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  saldo: number;
};

type RecorridoItem = {
  id: string;
  fecha: string;
  nombre: string;
  direccion: string;
};

type StockRow = {
  tipo: TipoHuevo;
  existenciaInicial: number;
  carga: number;
};

type DiaGuardado = {
  id: string;
  fecha: string;
  ventas: Venta[];
  stock: StockRow[];
  ultimaEdicionAt: string;
  ultimoDispositivo: string;
};

type VentaForm = {
  cliente: string;
  cantidad: string;
  tipo: "" | TipoHuevo;
  valor: string;
  efectivo: string;
  transferencia: string;
  aclaracionTransferencia: string;
  cuentaCorrienteManual: string;
};

type ClienteForm = {
  nombre: string;
  direccion: string;
  telefono: string;
};

const STORAGE = {
  ventas: "granja_lafeliz_ventas_v2",
  clientes: "granja_lafeliz_clientes_v2",
  recorrido: "granja_lafeliz_recorrido_v2",
  stock: "granja_lafeliz_stock_v2",
  historial: "granja_lafeliz_historial_v2",
};

const EMPTY_VENTA: VentaForm = {
  cliente: "",
  cantidad: "",
  tipo: "",
  valor: "",
  efectivo: "",
  transferencia: "",
  aclaracionTransferencia: "",
  cuentaCorrienteManual: "",
};

const EMPTY_CLIENTE: ClienteForm = {
  nombre: "",
  direccion: "",
  telefono: "",
};

function createStock(): StockRow[] {
  return TIPOS.map((tipo) => ({ tipo, existenciaInicial: 0, carga: 0 }));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function humanDate(s?: string): string {
  if (!s) return "-";
  return new Intl.DateTimeFormat("es-AR").format(new Date(`${s}T00:00:00`));
}

function humanDateTime(s?: string): string {
  if (!s) return "-";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(s));
}

function currentDevice(): string {
  return typeof navigator === "undefined" ? "Desconocido" : navigator.userAgent;
}

function shortDevice(ua?: string): string {
  if (!ua) return "Desconocido";
  const t = ua.toLowerCase();
  const system = t.includes("windows")
    ? "Windows"
    : t.includes("android")
      ? "Android"
      : t.includes("iphone") || t.includes("ipad")
        ? "iPhone/iPad"
        : t.includes("mac")
          ? "Mac"
          : t.includes("linux")
            ? "Linux"
            : "Dispositivo";
  const browser = t.includes("edg")
    ? "Edge"
    : t.includes("chrome")
      ? "Chrome"
      : t.includes("firefox")
        ? "Firefox"
        : t.includes("safari") && !t.includes("chrome")
          ? "Safari"
          : "Navegador";
  return `${system} - ${browser}`;
}

function calcDebe(valor: number, efectivo: number, transferencia: number): number {
  return Math.max(valor - efectivo - transferencia, 0);
}

function calcCuentaCorriente(valor: number, efectivo: number, transferencia: number, manual: number): number {
  const extra = Math.max(efectivo + transferencia - valor, 0);
  return manual + extra;
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function InfoCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="p-5">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Flash({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
      <CheckCircle2 className="h-4 w-4" />
      {text}
    </div>
  );
}

function TotalesPorTipo({ items }: { items: { tipo: string; total: number }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.tipo} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          {item.tipo}: {item.total}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recorrido, setRecorrido] = useState<RecorridoItem[]>([]);
  const [stock, setStock] = useState<StockRow[]>(createStock());
  const [historial, setHistorial] = useState<DiaGuardado[]>([]);

  const [ventaForm, setVentaForm] = useState<VentaForm>(EMPTY_VENTA);
  const [clienteForm, setClienteForm] = useState<ClienteForm>(EMPTY_CLIENTE);
  const [mostrarClienteForm, setMostrarClienteForm] = useState(false);
  const [mostrarPopupRecorrido, setMostrarPopupRecorrido] = useState(false);
  const [recorridoTexto, setRecorridoTexto] = useState("");
  const [recorridoPopupTexto, setRecorridoPopupTexto] = useState("");
  const [showVentaSuggestions, setShowVentaSuggestions] = useState(false);
  const [showRecorridoSuggestions, setShowRecorridoSuggestions] = useState(false);
  const [showRecorridoPopupSuggestions, setShowRecorridoPopupSuggestions] = useState(false);
  const [editingVentaId, setEditingVentaId] = useState<string | null>(null);
  const [editingClienteId, setEditingClienteId] = useState<string | null>(null);
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [mensaje, setMensaje] = useState("");

  const fecha = todayISO();

  useEffect(() => {
    setVentas(loadJson<Venta[]>(STORAGE.ventas, []));
    setClientes(loadJson<Cliente[]>(STORAGE.clientes, []));
    setStock(loadJson<StockRow[]>(STORAGE.stock, createStock()));
    setHistorial(loadJson<DiaGuardado[]>(STORAGE.historial, []));
    const rec = loadJson<RecorridoItem[]>(STORAGE.recorrido, []);
    setRecorrido(rec.filter((x) => x.fecha === fecha));
  }, [fecha]);

  useEffect(() => saveJson(STORAGE.ventas, ventas), [ventas]);
  useEffect(() => saveJson(STORAGE.clientes, clientes), [clientes]);
  useEffect(() => saveJson(STORAGE.stock, stock), [stock]);
  useEffect(() => saveJson(STORAGE.historial, historial), [historial]);
  useEffect(() => saveJson(STORAGE.recorrido, recorrido.filter((x) => x.fecha === fecha)), [recorrido, fecha]);

  const ventaSuggestions = useMemo(() => {
    const txt = ventaForm.cliente.toLowerCase().trim();
    if (!txt) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(txt)).slice(0, 6);
  }, [clientes, ventaForm.cliente]);

  const recorridoSuggestions = useMemo(() => {
    const txt = recorridoTexto.toLowerCase().trim();
    if (!txt) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(txt)).slice(0, 6);
  }, [clientes, recorridoTexto]);

  const popupRecorridoSuggestions = useMemo(() => {
    const txt = recorridoPopupTexto.toLowerCase().trim();
    if (!txt) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(txt)).slice(0, 6);
  }, [clientes, recorridoPopupTexto]);

  const preview = useMemo(() => {
    const valor = Number(ventaForm.valor || 0);
    const efectivo = Number(ventaForm.efectivo || 0);
    const transferencia = Number(ventaForm.transferencia || 0);
    const manual = Number(ventaForm.cuentaCorrienteManual || 0);
    return {
      debe: calcDebe(valor, efectivo, transferencia),
      cuentaCorriente: calcCuentaCorriente(valor, efectivo, transferencia, manual),
    };
  }, [ventaForm]);

  const ventasFiltradas = useMemo(() => {
    const q = query.toLowerCase().trim();
    return ventas.filter((v) => {
      const okText = !q || [v.cliente, v.tipo, v.fecha].join(" ").toLowerCase().includes(q);
      const okDate = !fechaFiltro || v.fecha === fechaFiltro;
      return okText && okDate;
    });
  }, [ventas, query, fechaFiltro]);

  const totales = useMemo(
    () => ({
      cantidad: ventasFiltradas.reduce((a, v) => a + v.cantidad, 0),
      valor: ventasFiltradas.reduce((a, v) => a + v.valor, 0),
      efectivo: ventasFiltradas.reduce((a, v) => a + v.efectivo, 0),
      transferencia: ventasFiltradas.reduce((a, v) => a + v.transferencia, 0),
      debe: ventasFiltradas.reduce((a, v) => a + v.debe, 0),
      cuentaCorriente: ventasFiltradas.reduce((a, v) => a + v.cuentaCorriente, 0),
    }),
    [ventasFiltradas],
  );

  const totalesPorTipo = useMemo(
    () => TIPOS.map((tipo) => ({ tipo, total: ventasFiltradas.filter((v) => v.tipo === tipo).reduce((a, v) => a + v.cantidad, 0) })),
    [ventasFiltradas],
  );

  const stockCalculado = useMemo(() => {
    const ventasPorTipo = TIPOS.reduce<Record<TipoHuevo, number>>((acc, tipo) => {
      acc[tipo] = ventas.reduce((sum, v) => sum + (v.tipo === tipo ? v.cantidad : 0), 0);
      return acc;
    }, {} as Record<TipoHuevo, number>);

    return stock.map((row) => ({
      ...row,
      ventas: ventasPorTipo[row.tipo] || 0,
      existenciaFinal: row.existenciaInicial + row.carga - (ventasPorTipo[row.tipo] || 0),
    }));
  }, [ventas, stock]);

  const flash = (text: string) => {
    setMensaje(text);
    window.setTimeout(() => setMensaje(""), 2200);
  };

  const limpiarVenta = () => {
    setVentaForm(EMPTY_VENTA);
    setEditingVentaId(null);
    setShowVentaSuggestions(false);
  };

  const limpiarCliente = () => {
    setClienteForm(EMPTY_CLIENTE);
    setEditingClienteId(null);
    setMostrarClienteForm(false);
  };

  const addRecorridoInternal = (texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const cliente = clientes.find((c) => c.nombre.toLowerCase() === limpio.toLowerCase());
    const nombre = cliente?.nombre ?? limpio;
    const direccion = cliente?.direccion?.trim() ? cliente.direccion : "Esporádico";
    const existe = recorrido.some((r) => r.fecha === fecha && r.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe) return flash("Ese nombre ya está en el recorrido de hoy.");
    setRecorrido((prev) => [...prev, { id: makeId(), fecha, nombre, direccion }]);
    flash("Agregado al recorrido.");
  };

  const addRecorrido = (textoBase?: string) => {
    addRecorridoInternal(textoBase ?? recorridoTexto);
    setRecorridoTexto("");
    setShowRecorridoSuggestions(false);
  };

  const addRecorridoPopup = (textoBase?: string) => {
    addRecorridoInternal(textoBase ?? recorridoPopupTexto);
    setRecorridoPopupTexto("");
    setShowRecorridoPopupSuggestions(false);
  };

  const quitarRecorrido = (id: string) => {
    setRecorrido((prev) => prev.filter((r) => r.id !== id));
  };

  const guardarCliente = () => {
    const nombre = clienteForm.nombre.trim();
    if (!nombre) return flash("Ingresá un nombre de cliente.");

    if (editingClienteId) {
      setClientes((prev) =>
        prev.map((c) =>
          c.id === editingClienteId
            ? { ...c, nombre, direccion: clienteForm.direccion.trim(), telefono: clienteForm.telefono.trim() }
            : c,
        ),
      );
      limpiarCliente();
      return flash("Cliente actualizado.");
    }

    const existe = clientes.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe) return flash("Ese cliente ya existe.");

    setClientes((prev) => [
      { id: makeId(), nombre, direccion: clienteForm.direccion.trim(), telefono: clienteForm.telefono.trim(), saldo: 0 },
      ...prev,
    ]);
    limpiarCliente();
    flash("Cliente agregado.");
  };

  const editarCliente = (cliente: Cliente) => {
    setEditingClienteId(cliente.id);
    setClienteForm({ nombre: cliente.nombre, direccion: cliente.direccion, telefono: cliente.telefono });
    setMostrarClienteForm(true);
  };

  const actualizarSaldoCliente = (nombre: string, deuda: number, pagoCC: number) => {
    setClientes((prev) => {
      const existe = prev.some((c) => c.nombre === nombre);
      const base = existe ? prev : [{ id: makeId(), nombre, direccion: "", telefono: "", saldo: 0 }, ...prev];
      return base.map((c) => (c.nombre === nombre ? { ...c, saldo: c.saldo + deuda - pagoCC } : c));
    });
  };

  const whatsappCliente = (cliente: Cliente) => {
    let telefono = String(cliente.telefono || "").replace(/\D/g, "");
    if (!telefono) return flash("El cliente no tiene teléfono cargado.");
    if (!telefono.startsWith("54")) telefono = `54${telefono}`;
    if (!telefono.startsWith("549")) telefono = telefono.replace(/^54/, "549");
    const texto =
      cliente.saldo > 0
        ? `Hola ${cliente.nombre}, su deuda es ${money(cliente.saldo)}`
        : cliente.saldo < 0
          ? `Hola ${cliente.nombre}, su saldo a favor es ${money(Math.abs(cliente.saldo))}`
          : `Hola ${cliente.nombre}, su saldo es 0`;
    window.location.href = `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
  };

  const guardarVenta = (e: React.FormEvent) => {
    e.preventDefault();
    const cliente = ventaForm.cliente.trim();
    const cantidad = Number(ventaForm.cantidad || 0);
    const valor = Number(ventaForm.valor || 0);
    const efectivo = Number(ventaForm.efectivo || 0);
    const transferencia = Number(ventaForm.transferencia || 0);
    const cuentaCorriente = preview.cuentaCorriente;
    const debe = preview.debe;

    if (!cliente || !ventaForm.tipo || cantidad <= 0 || valor <= 0) {
      return flash("Completá cliente, tipo, cantidad y valor.");
    }
    if (transferencia > 0 && !ventaForm.aclaracionTransferencia.trim()) {
      return flash("Agregá una aclaración para la transferencia.");
    }

    const base: Omit<Venta, "id" | "createdAt"> = {
      fecha,
      cliente,
      cantidad,
      tipo: ventaForm.tipo,
      valor,
      efectivo,
      transferencia,
      aclaracionTransferencia: ventaForm.aclaracionTransferencia.trim(),
      debe,
      cuentaCorriente,
    };

    if (editingVentaId) {
      setVentas((prev) => prev.map((v) => (v.id === editingVentaId ? { ...v, ...base } : v)));
      limpiarVenta();
      return flash("Venta actualizada.");
    }

    const nueva: Venta = { id: makeId(), createdAt: new Date().toISOString(), ...base };
    setVentas((prev) => [nueva, ...prev]);

    const clienteExistente = clientes.find((c) => c.nombre.toLowerCase() === cliente.toLowerCase());
    if (clienteExistente?.direccion) {
      const existeRecorrido = recorrido.some((r) => r.fecha === fecha && r.nombre.toLowerCase() === clienteExistente.nombre.toLowerCase());
      if (!existeRecorrido) {
        setRecorrido((prev) => [...prev, { id: makeId(), fecha, nombre: clienteExistente.nombre, direccion: clienteExistente.direccion }]);
      }
    }

    actualizarSaldoCliente(cliente, debe, cuentaCorriente);
    limpiarVenta();
    flash("Venta agregada.");
  };

  const editarVenta = (venta: Venta) => {
    setEditingVentaId(venta.id);
    setVentaForm({
      cliente: venta.cliente,
      cantidad: String(venta.cantidad),
      tipo: venta.tipo,
      valor: String(venta.valor),
      efectivo: String(venta.efectivo),
      transferencia: String(venta.transferencia),
      aclaracionTransferencia: venta.aclaracionTransferencia,
      cuentaCorrienteManual: String(venta.cuentaCorriente),
    });
    setShowVentaSuggestions(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const borrarVenta = (id: string) => {
    setVentas((prev) => prev.filter((v) => v.id !== id));
    if (editingVentaId === id) limpiarVenta();
    flash("Venta eliminada.");
  };

  const guardarDia = () => {
    const dia: DiaGuardado = {
      id: makeId(),
      fecha,
      ventas,
      stock,
      ultimaEdicionAt: new Date().toISOString(),
      ultimoDispositivo: currentDevice(),
    };
    setHistorial((prev) => [dia, ...prev]);
    flash("Día guardado.");
  };

  const nuevoReparto = () => {
    const nextStock = stockCalculado.map((r) => ({ tipo: r.tipo, existenciaInicial: r.existenciaFinal, carga: 0 }));
    setStock(nextStock);
    setVentas([]);
    setRecorrido([]);
    limpiarVenta();
    flash("Nuevo reparto iniciado.");
  };

  const abrirDia = (dia: DiaGuardado) => {
    setVentas(dia.ventas);
    setStock(dia.stock);
    flash("Día cargado en pantalla.");
  };

  const exportarVentas = () => {
    downloadCsv(
      `ventas-${fecha}.csv`,
      ventas.map((v) => ({
        Fecha: v.fecha,
        Cliente: v.cliente,
        Cantidad: v.cantidad,
        Tipo: v.tipo,
        Valor: v.valor,
        Efectivo: v.efectivo,
        Transferencia: v.transferencia,
        Debe: v.debe,
        "Cuenta corriente": v.cuentaCorriente > 0 ? -Math.abs(v.cuentaCorriente) : 0,
        Aclaracion: v.aclaracionTransferencia,
      })),
    );
  };

  const exportarStock = () => {
    downloadCsv(
      `stock-${fecha}.csv`,
      stockCalculado.map((r) => ({
        Tipo: r.tipo,
        "Existencia inicial": r.existenciaInicial,
        Carga: r.carga,
        Ventas: r.ventas,
        "Existencia final": r.existenciaFinal,
      })),
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 shadow-sm">
                  <Save className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Granja La Feliz Reparto</CardTitle>
                  <p className="text-sm text-slate-500">Gestión diaria de ventas, clientes, stock y reparto para usar en la calle.</p>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative" onMouseEnter={() => setMostrarPopupRecorrido(true)} onMouseLeave={() => setMostrarPopupRecorrido(false)}>
              <InfoCard title="Fecha" value={humanDate(fecha)} />
              {mostrarPopupRecorrido && (
                <div className="absolute left-0 top-full z-30 mt-2 w-[300px] rounded-2xl border bg-white p-3 shadow-xl">
                  <div className="mb-2 text-sm font-semibold">Recorrido del día</div>
                  {recorrido.length ? (
                    <ScrollArea className="max-h-[220px] pr-2">
                      <div className="space-y-2">
                        {recorrido.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="block w-full rounded-xl bg-slate-50 p-2 text-left text-sm hover:bg-emerald-50"
                            onClick={() => quitarRecorrido(item.id)}
                          >
                            <div className="font-medium">{item.nombre}</div>
                            <div className="text-xs text-slate-500">{item.direccion}</div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-sm text-slate-500">Todavía no hay clientes cargados en el recorrido de hoy.</div>
                  )}

                  <div className="mt-3 border-t pt-3">
                    <div className="mb-2 text-xs font-medium text-slate-600">Agregar recorrido</div>
                    <div className="relative">
                      <Input
                        value={recorridoPopupTexto}
                        onChange={(e) => {
                          setRecorridoPopupTexto(e.target.value);
                          setShowRecorridoPopupSuggestions(true);
                        }}
                        onFocus={() => setShowRecorridoPopupSuggestions(true)}
                        placeholder="Agregar recorrido"
                        className="h-9"
                      />
                      {showRecorridoPopupSuggestions && popupRecorridoSuggestions.length > 0 && recorridoPopupTexto.trim() && (
                        <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg">
                          {popupRecorridoSuggestions.map((cliente) => (
                            <button
                              key={cliente.id}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                              onClick={() => addRecorridoPopup(cliente.nombre)}
                            >
                              {cliente.nombre}
                              {cliente.direccion ? ` - ${cliente.direccion}` : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button type="button" size="sm" onClick={() => addRecorridoPopup()} className="mt-2 w-full">
                      Agregar
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <InfoCard title="Ventas del día" value={ventas.length} />
            <InfoCard title="Estado" value={ventas.length ? "Abierto" : "Nuevo"} />
          </div>
        </div>

        <Flash text={mensaje} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard title="Valor cargado" value={money(totales.valor)} />
          <InfoCard title="Efectivo" value={money(totales.efectivo)} />
          <InfoCard title="Transferencias" value={money(totales.transferencia)} />
          <InfoCard title="Debe" value={money(totales.debe)} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative w-full sm:w-[320px]">
              <Input
                value={recorridoTexto}
                onChange={(e) => {
                  setRecorridoTexto(e.target.value);
                  setShowRecorridoSuggestions(true);
                }}
                onFocus={() => setShowRecorridoSuggestions(true)}
                placeholder="Agregar gente al recorrido"
                className="w-full rounded-xl"
              />
              {showRecorridoSuggestions && recorridoSuggestions.length > 0 && recorridoTexto.trim() && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg">
                  {recorridoSuggestions.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => addRecorrido(cliente.nombre)}
                    >
                      {cliente.nombre}
                      {cliente.direccion ? ` - ${cliente.direccion}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button type="button" className="w-full rounded-xl min-h-[46px] sm:w-auto" onClick={() => addRecorrido()}>
              Agregar recorrido
            </Button>
          </div>

          <Button className="rounded-xl min-h-[46px]" onClick={nuevoReparto}>
            <PlusCircle className="mr-2 h-4 w-4" />Nuevo reparto
          </Button>
          <Button variant="outline" className="rounded-xl min-h-[46px]" onClick={guardarDia}>
            <Save className="mr-2 h-4 w-4" />Guardar día
          </Button>
          <Button variant="outline" className="rounded-xl min-h-[46px]" onClick={exportarVentas}>
            <Download className="mr-2 h-4 w-4" />Exportar ventas CSV
          </Button>
        </div>

        <Tabs defaultValue="carga" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl p-1 md:grid-cols-5 md:h-10">
            <TabsTrigger value="carga" className="min-h-[44px] whitespace-normal px-2 py-2">Carga</TabsTrigger>
            <TabsTrigger value="ventas" className="min-h-[44px] whitespace-normal px-2 py-2">Ventas</TabsTrigger>
            <TabsTrigger value="stock" className="min-h-[44px] whitespace-normal px-2 py-2">Stock</TabsTrigger>
            <TabsTrigger value="historial" className="min-h-[44px] whitespace-normal px-2 py-2">Historial días</TabsTrigger>
            <TabsTrigger value="clientes" className="min-h-[44px] whitespace-normal px-2 py-2">Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="carga">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">{editingVentaId ? "Editar venta" : "Nueva venta del reparto"}</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={guardarVenta}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fecha</Label>
                      <Input type="date" value={fecha} disabled />
                    </div>

                    <div className="relative space-y-2">
                      <Label>Cliente</Label>
                      <Input
                        value={ventaForm.cliente}
                        onChange={(e) => {
                          setVentaForm((prev) => ({ ...prev, cliente: e.target.value }));
                          setShowVentaSuggestions(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowVentaSuggestions(true)}
                        placeholder="Nombre del cliente"
                      />
                      {showVentaSuggestions && ventaSuggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg">
                          {ventaSuggestions.map((cliente) => (
                            <button
                              key={cliente.id}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                              onClick={() => {
                                setVentaForm((prev) => ({ ...prev, cliente: cliente.nombre }));
                                setShowVentaSuggestions(false);
                              }}
                            >
                              {cliente.nombre}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Cantidad</Label>
                      <Input type="number" value={ventaForm.cantidad} onChange={(e) => setVentaForm((p) => ({ ...p, cantidad: e.target.value }))} placeholder="0" />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
                        {TIPOS.map((tipo) => (
                          <Button
                            key={tipo}
                            type="button"
                            variant={ventaForm.tipo === tipo ? "default" : "outline"}
                            className="min-h-[42px] rounded-xl"
                            onClick={() => setVentaForm((p) => ({ ...p, tipo }))}
                          >
                            {tipo}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <Input type="number" value={ventaForm.valor} onChange={(e) => setVentaForm((p) => ({ ...p, valor: e.target.value }))} placeholder="0" />
                    </div>

                    <div className="space-y-2">
                      <Label>Efectivo</Label>
                      <Input type="number" value={ventaForm.efectivo} onChange={(e) => setVentaForm((p) => ({ ...p, efectivo: e.target.value }))} placeholder="0" />
                    </div>

                    <div className="space-y-2">
                      <Label>Transferencia</Label>
                      <Input type="number" value={ventaForm.transferencia} onChange={(e) => setVentaForm((p) => ({ ...p, transferencia: e.target.value }))} placeholder="0" />
                    </div>

                    {Number(ventaForm.transferencia || 0) > 0 && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Aclaración transferencia</Label>
                        <Input
                          value={ventaForm.aclaracionTransferencia}
                          onChange={(e) => setVentaForm((p) => ({ ...p, aclaracionTransferencia: e.target.value }))}
                          placeholder="Ej: Cuenta Lucorin o Cuenta Vivorata"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Debe</Label>
                      <Input type="number" value={preview.debe} disabled />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Cuenta corriente</Label>
                      <Input
                        type="number"
                        value={preview.cuentaCorriente}
                        onChange={(e) => setVentaForm((p) => ({ ...p, cuentaCorrienteManual: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" className="min-h-[48px] w-full rounded-xl sm:w-auto">
                      <Send className="mr-2 h-4 w-4" />{editingVentaId ? "Guardar cambios" : "Agregar venta"}
                    </Button>
                    <Button type="button" variant="outline" className="min-h-[48px] w-full rounded-xl sm:w-auto" onClick={limpiarVenta}>
                      {editingVentaId ? (
                        <>
                          <X className="mr-2 h-4 w-4" />Cancelar edición
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />Limpiar
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ventas">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-xl">Ventas del día</CardTitle>
                <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-2xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente, tipo o fecha" className="pl-9" />
                  </div>
                  <Input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="sm:w-[180px]" />
                  <Button variant="outline" onClick={() => setFechaFiltro("")}>Limpiar fecha</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Efectivo</TableHead>
                        <TableHead>Transfer.</TableHead>
                        <TableHead>Debe</TableHead>
                        <TableHead>Cuenta corriente</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventasFiltradas.length ? (
                        <>
                          {ventasFiltradas.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>{humanDate(row.fecha)}</TableCell>
                              <TableCell className="font-medium">{row.cliente}</TableCell>
                              <TableCell>{row.cantidad}</TableCell>
                              <TableCell>{row.tipo}</TableCell>
                              <TableCell>{money(row.valor)}</TableCell>
                              <TableCell>{money(row.efectivo)}</TableCell>
                              <TableCell>
                                <div>{money(row.transferencia)}</div>
                                {row.aclaracionTransferencia ? <div className="text-xs text-slate-400">{row.aclaracionTransferencia}</div> : null}
                              </TableCell>
                              <TableCell>{row.debe > 0 ? <Badge>{money(row.debe)}</Badge> : "-"}</TableCell>
                              <TableCell>
                                {row.cuentaCorriente > 0 ? (
                                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{money(-Math.abs(row.cuentaCorriente))}</Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => editarVenta(row)}>
                                    <Pencil className="mr-2 h-4 w-4" />Editar
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => borrarVenta(row.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" />Borrar
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-slate-50 font-semibold">
                            <TableCell>TOTAL</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell>{totales.cantidad}</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell>{money(totales.valor)}</TableCell>
                            <TableCell>{money(totales.efectivo)}</TableCell>
                            <TableCell>{money(totales.transferencia)}</TableCell>
                            <TableCell>{money(totales.debe)}</TableCell>
                            <TableCell>{money(-totales.cuentaCorriente)}</TableCell>
                            <TableCell />
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={10}>
                              <div className="py-2">
                                <div className="mb-2 text-sm font-medium">Cantidad por tipo</div>
                                <TotalesPorTipo items={totalesPorTipo} />
                              </div>
                            </TableCell>
                          </TableRow>
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={10} className="h-20 text-center text-slate-500">No hay ventas para mostrar.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl">Stock del día</CardTitle>
                <Button variant="outline" onClick={exportarStock}>
                  <Download className="mr-2 h-4 w-4" />Exportar CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        {TIPOS.map((tipo) => (
                          <TableHead key={tipo}>{tipo}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { key: "existenciaInicial", label: "Existencia inicial", editable: true },
                        { key: "carga", label: "Carga", editable: true },
                        { key: "ventas", label: "Ventas", editable: false },
                        { key: "existenciaFinal", label: "Existencia final", editable: false },
                      ].map((linea) => (
                        <TableRow key={linea.key}>
                          <TableCell className="font-medium">{linea.label}</TableCell>
                          {stockCalculado.map((row) => (
                            <TableCell key={`${linea.key}-${row.tipo}`}>
                              {linea.editable ? (
                                <Input
                                  type="number"
                                  value={String(row[linea.key as keyof StockCalcRow] ?? 0)}
                                  onChange={(e) =>
                                    setStock((prev) =>
                                      prev.map((s) => (s.tipo === row.tipo ? { ...s, [linea.key]: Number(e.target.value || 0) } : s)),
                                    )
                                  }
                                />
                              ) : (
                                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center font-medium">{String(row[linea.key as keyof StockCalcRow] ?? 0)}</div>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historial">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Historial de días guardados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {historial.length ? (
                    historial.map((dia) => (
                      <div key={dia.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold">{humanDate(dia.fecha)}</p>
                            <p className="text-sm text-slate-500">Ventas: {dia.ventas.length}</p>
                            <p className="text-sm text-slate-500">Última edición: {humanDateTime(dia.ultimaEdicionAt)}</p>
                            <p className="text-sm text-slate-500">Dispositivo: {shortDevice(dia.ultimoDispositivo)}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => abrirDia(dia)}>
                              <Pencil className="mr-2 h-4 w-4" />Abrir
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                downloadCsv(
                                  `ventas-${dia.fecha}.csv`,
                                  dia.ventas.map((v) => ({
                                    Fecha: v.fecha,
                                    Cliente: v.cliente,
                                    Cantidad: v.cantidad,
                                    Tipo: v.tipo,
                                    Valor: v.valor,
                                    Debe: v.debe,
                                  })),
                                )
                              }
                            >
                              <Download className="mr-2 h-4 w-4" />Descargar CSV
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-500">
                      Todavía no hay días guardados. Cuando guardes una jornada, va a aparecer acá para volver a abrirla o descargarla.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clientes">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-2">
                  <Button type="button" onClick={() => (mostrarClienteForm && editingClienteId ? limpiarCliente() : setMostrarClienteForm((p) => !p))}>
                    {mostrarClienteForm ? "Cerrar" : "Agregar cliente"}
                  </Button>
                </div>

                {mostrarClienteForm && (
                  <div className="mb-4 grid gap-3 rounded-xl border p-4 md:grid-cols-3">
                    <Input placeholder="Nombre" value={clienteForm.nombre} onChange={(e) => setClienteForm((p) => ({ ...p, nombre: e.target.value }))} />
                    <Input placeholder="Dirección" value={clienteForm.direccion} onChange={(e) => setClienteForm((p) => ({ ...p, direccion: e.target.value }))} />
                    <Input placeholder="Teléfono" value={clienteForm.telefono} onChange={(e) => setClienteForm((p) => ({ ...p, telefono: e.target.value }))} />
                    <div className="flex gap-2 md:col-span-3">
                      <Button type="button" onClick={guardarCliente}>{editingClienteId ? "Guardar cambios" : "Guardar cliente"}</Button>
                      {editingClienteId && (
                        <Button type="button" variant="outline" onClick={limpiarCliente}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {!clientes.length && (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-500">
                      Todavía no hay clientes cargados. Podés agregarlos con nombre, dirección y teléfono para usar autocompletado y enviar WhatsApp.
                    </div>
                  )}
                  {clientes.map((c) => (
                    <div key={c.id} className="rounded-xl border p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold">{c.nombre}</div>
                          <div className="text-xs text-slate-500">{c.direccion || "Sin dirección"}</div>
                          <div className="text-xs text-slate-500">{c.telefono || "Sin teléfono"}</div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <span className={`font-semibold ${c.saldo < 0 ? "text-emerald-600" : c.saldo > 0 ? "text-red-600" : "text-slate-700"}`}>
                            {c.saldo < 0 ? "Saldo a favor: " : c.saldo > 0 ? "Deuda: " : "Saldo: "}
                            {money(c.saldo < 0 ? Math.abs(c.saldo) : c.saldo)}
                          </span>
                          <Button type="button" variant="outline" size="sm" onClick={() => editarCliente(c)}>
                            <Pencil className="mr-2 h-4 w-4" />Editar
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => whatsappCliente(c)}>
                            <MessageCircle className="mr-2 h-4 w-4" />WhatsApp
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setExpandedClienteId((p) => (p === c.id ? null : c.id))}>
                            {expandedClienteId === c.id ? "Ocultar" : "Ver"}
                          </Button>
                        </div>
                      </div>
                      {expandedClienteId === c.id && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Saldo actual: {money(c.saldo)}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="rounded-2xl border bg-white p-4 text-xs text-slate-500 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-700">Versión inicial lista para publicar</div>
          Los datos se guardan localmente en este dispositivo. Esta versión está pensada como una primera publicación simple y estable. Antes de subirla, probá carga de ventas, clientes, recorrido, guardado del día, exportación CSV y WhatsApp en el celular donde se va a usar.
        </div>

        <div className="text-center text-xs text-slate-400">Granja La Feliz Reparto · versión web inicial</div>
      </div>
    </div>
  );
}

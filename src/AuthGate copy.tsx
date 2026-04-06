import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import logo from "./assets/logo.png";

type Props = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [modoRegistro, setModoRegistro] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let activo = true;

    async function iniciar() {
      const { data, error } = await supabase.auth.getUser();

      if (!activo) return;

      if (error) {
        console.error(error);
        setUser(null);
      } else {
        setUser(data.user ?? null);
      }

      setLoading(false);
    }

    iniciar();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensaje("");
    setEnviando(true);

    try {
      if (modoRegistro) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMensaje("Usuario creado. Revisá tu mail si tenés confirmación activada.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      }
    } catch (err: any) {
      setMensaje(err?.message ?? "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  async function cerrarSesion() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error(error);
      setMensaje("No se pudo cerrar sesión.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 grid place-items-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="rounded-3xl bg-slate-50 p-4 shadow-sm">
              <img
                src="./assets/logo.png"
                alt="Logo Granja La Feliz"
                className="h-20 w-20 object-contain"
              />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              Granja La Feliz Reparto
            </h1>
            <p className="mt-2 text-sm text-slate-500">Cargando sistema...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="rounded-3xl bg-slate-50 p-4 shadow-sm">
                <img
                  src={logo}
                  alt="Logo Granja La Feliz"
                  className="h-20 w-20 object-contain"
                />
              </div>

              <h1 className="mt-4 text-2xl font-bold text-slate-900">
                Granja La Feliz
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                {modoRegistro
                  ? "Creá tu cuenta para ingresar al sistema."
                  : "Ingresá con tu usuario para acceder al sistema."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-slate-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tuemail@mail.com"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-slate-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                />
              </div>

              {mensaje && (
                <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                  {mensaje}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando
                  ? "Procesando..."
                  : modoRegistro
                  ? "Crear cuenta"
                  : "Ingresar"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setModoRegistro((prev) => !prev);
                setMensaje("");
              }}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {modoRegistro ? "Ya tengo cuenta" : "Crear usuario"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="text-sm text-slate-600">
            Sesión iniciada como <strong>{user.email}</strong>
          </div>

          <button
            onClick={cerrarSesion}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {children}
    </>
  );
}
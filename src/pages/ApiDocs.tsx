import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Search } from 'lucide-react';
import {
  API_BASE_HINT,
  API_ENDPOINTS,
  API_GROUPS,
  AUTH_NOTES,
  type ApiEndpointDoc,
  type AuthKind,
  type HttpMethod,
} from '../data/api-docs';

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-100 text-emerald-800',
  POST: 'bg-blue-100 text-blue-800',
  PATCH: 'bg-amber-100 text-amber-800',
  PUT: 'bg-violet-100 text-violet-800',
  DELETE: 'bg-red-100 text-red-800',
};

const AUTH_BADGE: Record<AuthKind, string> = {
  none: 'bg-gray-100 text-gray-700',
  jwt: 'bg-primary-100 text-primary-800',
  admin: 'bg-purple-100 text-purple-800',
  finanzas: 'bg-orange-100 text-orange-800',
  portal: 'bg-teal-100 text-teal-800',
};

function buildFetchExample(ep: ApiEndpointDoc, baseUrl: string): string {
  const url = `${baseUrl || ''}${ep.path}${ep.query ? ep.query.replace('?', '') : ''}`;
  const fullUrl = ep.query ? `${baseUrl || ''}${ep.path}${ep.query}` : url;
  const headers: string[] = ["  'Content-Type': 'application/json'"];
  if (ep.auth === 'jwt' || ep.auth === 'admin' || ep.auth === 'finanzas') {
    headers.push("  Authorization: `Bearer ${token}`");
  }
  if (ep.auth === 'finanzas') {
    headers.push("  'X-Finanzas-Token': finanzasToken // si hay PIN activo");
  }
  const lines = [
    `const res = await fetch('${fullUrl}', {`,
    `  method: '${ep.method}',`,
    `  headers: {`,
    ...headers.map((h) => `    ${h},`),
    `  },`,
  ];
  if (ep.body && ep.method !== 'GET') {
    lines.push(`  body: JSON.stringify(${ep.body.split('\n').join('\n  ')}),`);
  }
  lines.push('});');
  lines.push('const data = await res.json();');
  return lines.join('\n');
}

function buildCurlExample(ep: ApiEndpointDoc, baseUrl: string): string {
  const fullUrl = ep.query ? `${baseUrl || 'https://TU-DOMINIO'}${ep.path}${ep.query}` : `${baseUrl || 'https://TU-DOMINIO'}${ep.path}`;
  const parts = [`curl -X ${ep.method} '${fullUrl}'`];
  parts.push("  -H 'Content-Type: application/json'");
  if (ep.auth === 'jwt' || ep.auth === 'admin' || ep.auth === 'finanzas') {
    parts.push("  -H 'Authorization: Bearer TU_TOKEN'");
  }
  if (ep.auth === 'finanzas') {
    parts.push("  -H 'X-Finanzas-Token: TOKEN_FINANZAS'");
  }
  if (ep.body && ep.method !== 'GET') {
    const compact = ep.body.replace(/\s+/g, ' ').trim();
    parts.push(`  -d '${compact}'`);
  }
  return parts.join(' \\\n');
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 px-2 py-1 rounded hover:bg-primary-50"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="text-xs sm:text-sm bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

function EndpointCard({ ep, baseUrl }: { ep: ApiEndpointDoc; baseUrl: string }) {
  return (
    <article className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-wrap items-start gap-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
        <code className="text-sm font-mono text-gray-900 flex-1 min-w-0 break-all">{ep.path}</code>
        <span className={`text-xs px-2 py-1 rounded ${AUTH_BADGE[ep.auth]}`}>{ep.auth}</span>
      </div>
      <div className="p-4 sm:p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">{ep.title}</h3>
        {ep.client && (
          <p className="text-sm text-gray-600">
            <span className="font-medium">En el código:</span> <code className="text-primary-700">{ep.client}</code>
          </p>
        )}
        {ep.notes && <p className="text-sm text-gray-600">{ep.notes}</p>}
        {ep.query && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Query</p>
            <code className="text-sm bg-gray-50 px-2 py-1 rounded block">{ep.query}</code>
          </div>
        )}
        {ep.body && <CopyBlock text={ep.body} label="Body (JSON)" />}
        {ep.response && <CopyBlock text={ep.response} label="Respuesta ejemplo" />}
        <CopyBlock text={buildFetchExample(ep, baseUrl)} label="Ejemplo fetch (JavaScript)" />
        <CopyBlock text={buildCurlExample(ep, baseUrl)} label="Ejemplo curl" />
      </div>
    </article>
  );
}

export default function ApiDocs() {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>('Todos');
  const [baseUrl, setBaseUrl] = useState(
    typeof window !== 'undefined' ? window.location.origin : ''
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return API_ENDPOINTS.filter((ep) => {
      if (group !== 'Todos' && ep.group !== group) return false;
      if (!q) return true;
      return (
        ep.title.toLowerCase().includes(q) ||
        ep.path.toLowerCase().includes(q) ||
        ep.group.toLowerCase().includes(q) ||
        (ep.client?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [search, group]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpointDoc[]>();
    for (const ep of filtered) {
      if (!map.has(ep.group)) map.set(ep.group, []);
      map.get(ep.group)!.push(ep);
    }
    return map;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />
            Inicio
          </Link>
          <h1 className="text-xl font-bold text-gray-900 flex-1">Documentación API</h1>
          <span className="text-xs text-gray-500">{API_ENDPOINTS.length} endpoints</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Cómo llama la app al servidor</h2>
          <p className="text-sm text-gray-600">{API_BASE_HINT}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL para los ejemplos</label>
            <input
              className="input-field font-mono text-sm"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value.replace(/\/$/, ''))}
              placeholder="https://tu-app.railway.app"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {(Object.keys(AUTH_NOTES) as AuthKind[]).map((k) => (
              <div key={k} className="rounded-lg bg-gray-50 p-3">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${AUTH_BADGE[k]}`}>{k}</span>
                <p className="text-gray-600 mt-1 text-xs">{AUTH_NOTES[k]}</p>
              </div>
            ))}
          </div>
          <CopyBlock
            label="Patrón general (src/utils/storage-api.ts)"
            text={`const url = (import.meta.env.VITE_API_URL ?? '') + '/api/alumnos';

const res = await fetch(url, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    Authorization: \`Bearer \${localStorage.getItem('savia_token')}\`,
    // X-Finanzas-Token: ... (solo Pagos/Caja con PIN)
  },
});

if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || res.statusText);
}

const data = await res.json();`}
          />
        </section>

        <section className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input-field pl-10"
              placeholder="Buscar endpoint, ruta o módulo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input-field sm:w-48"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="Todos">Todos los grupos</option>
            {API_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </section>

        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-12">No hay endpoints que coincidan con la búsqueda.</p>
        ) : (
          [...grouped.entries()].map(([groupName, endpoints]) => (
            <section key={groupName} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{groupName}</h2>
              <div className="space-y-4">
                {endpoints.map((ep) => (
                  <EndpointCard key={`${ep.method}-${ep.path}-${ep.title}`} ep={ep} baseUrl={baseUrl} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

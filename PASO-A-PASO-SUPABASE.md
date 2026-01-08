# 📖 Guía Paso a Paso - Configurar Supabase

## ✅ Ya creaste el proyecto en Supabase - ¡Bien!

Ahora necesitás hacer 2 cosas:

## 🔧 Paso 1: Crear las Tablas

1. **En el panel de Supabase, en el menú izquierdo, buscá y hacé click en "SQL Editor"** 
   - Es un ícono que parece una base de datos o una terminal

2. **Click en "New query"** (botón arriba a la derecha o en el medio)

3. **Copiá TODO el contenido del archivo `supabase-setup.sql`** (está en tu carpeta del proyecto)

4. **Pegalo en el editor SQL** (el cuadro grande que aparece)

5. **Click en "Run"** (o presioná `Cmd + Enter` en Mac o `Ctrl + Enter` en Windows)

6. **Deberías ver un mensaje verde que dice "Success. No rows returned"**
   - Si ves un error, decime cuál es y lo solucionamos

## 🔑 Paso 2: Obtener las Credenciales

1. **En el menú izquierdo de Supabase, click en el ícono de engranaje ⚙️** (Settings)

2. **Click en "API"** (está en el menú lateral de Settings)

3. **Buscá estas dos secciones:**

   a) **Project URL**
      - Es una URL que empieza con `https://` seguido de letras y números, y termina con `.supabase.co`
      - Ejemplo: `https://abcdefghijklmnop.supabase.co`
      - **Copiá esta URL completa**

   b) **anon public** key (está más abajo)
      - Es una clave muy larga (como 200 caracteres)
      - Empieza con `eyJ` generalmente
      - **Copiá esta clave completa**

4. **Guardá estas dos cosas** en un lugar seguro por ahora

## 📝 Paso 3: Preparar para Vercel

Una vez que tengas:
- ✅ Las tablas creadas
- ✅ La Project URL
- ✅ La anon public key

**Decime y te guío para configurar Vercel y subir tu app a la web**

---

### 💡 Consejo
Si estás perdido en Supabase:
- El panel principal tiene un menú a la izquierda con opciones como:
  - Table Editor (para ver tablas)
  - SQL Editor (para ejecutar SQL)
  - Settings (configuración)
  - API (para obtener credenciales)

### ❓ ¿Dónde estoy ahora?
- Si estás en el dashboard principal: buscá "SQL Editor" en el menú izquierdo
- Si ya estás en SQL Editor: perfecto, ejecutá el script
- Si estás en Settings: buscá "API" y copiá las credenciales


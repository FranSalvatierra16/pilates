# 📱 Cómo Usar tu App desde el Celular - Guía Rápida

## 🚀 Paso 1: Desplegar a Vercel (5 minutos)

### 1. Crear cuenta en Vercel
1. Andá a https://vercel.com
2. Click en **"Sign Up"** o **"Log In"**
3. Elegí **"Continue with GitHub"** (es lo más fácil)

### 2. Importar tu proyecto
1. Una vez dentro de Vercel, click en **"Add New..."** → **"Project"**
2. Si no ves tu repositorio, click en **"Adjust GitHub App Permissions"** y dale permisos a Vercel
3. Buscá y seleccioná tu repositorio: **`pilates`**
4. Click en **"Import"**

### 3. Configurar Variables de Entorno (IMPORTANTE)
Antes de hacer deploy, configurá las variables de Supabase:

1. En la página de configuración del proyecto, bajá hasta **"Environment Variables"**
2. Agregá estas 2 variables:

   **Variable 1:**
   - **Name**: `VITE_SUPABASE_URL`
   - **Value**: `https://qihqwzavawufsekxbnco.supabase.co`
   - ✅ Marcar: Production, Preview, Development

   **Variable 2:**
   - **Name**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaHF3emF2YXd1ZnNla3hibmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjk3OTQsImV4cCI6MjA4MzQwNTc5NH0.DgpgRH69gl1VA16cky3Sw6zgAO9l8xMUcJKrp2_1LHw`
   - ✅ Marcar: Production, Preview, Development

3. Click en **"Save"**

### 4. Hacer Deploy
1. Una vez guardadas las variables, click en **"Deploy"**
2. Esperá 2-3 minutos mientras se construye
3. Cuando termine, verás un mensaje **"Congratulations! Your deployment has been created."**

### 5. Obtener la URL
1. En la página de deployment, verás una URL como: `https://pilates-xxxxx.vercel.app`
2. **¡Copiá esa URL!** Esa es la dirección de tu app

---

## 📱 Paso 2: Usar desde el Celular

### Opción A: Guardar como Acceso Rápido
1. Abrí la URL en el navegador de tu celular
2. En iPhone: Tap en el botón "Compartir" → "Agregar a Pantalla de Inicio"
3. En Android: Tap en el menú (3 puntos) → "Agregar a pantalla de inicio"

### Opción B: Crear un Enlace Rápido
1. Guardá la URL en tus favoritos
2. O compartila por WhatsApp para tenerla siempre a mano

---

## ✅ Verificar que Funciona

1. Abrí la URL en tu celular
2. Deberías ver tu app funcionando
3. Probá crear un alumno o actividad
4. Verificá en Supabase (Table Editor) que se haya guardado

---

## 🔄 Actualizar la App

Cada vez que hagas cambios y hagas `git push`:
1. Vercel detecta automáticamente los cambios
2. Hace un nuevo deploy automáticamente
3. Tu app se actualiza sola en unos minutos

---

## 💡 Consejos

- **La app ya es responsive**: Funciona bien en celular sin cambios adicionales
- **URL permanente**: La URL de Vercel no cambia a menos que elimines el proyecto
- **Dominio personalizado**: Si querés un dominio como `savia.com`, podés configurarlo después en Vercel (pero cuesta dinero)

---

## 🆘 Si Algo No Funciona

1. **La app no carga**: Verificá que las variables de entorno estén bien configuradas
2. **No se guardan los datos**: Revisá en Supabase que las tablas estén creadas
3. **Error de CORS**: En Supabase → Settings → API → Agregá tu dominio de Vercel a "Allowed Origins"

---

## 📞 Listo!

Una vez que tengas la URL de Vercel, podés usar tu app desde cualquier celular conectado a internet. 🎉


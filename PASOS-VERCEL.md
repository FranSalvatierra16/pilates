# 🚀 Pasos para Desplegar a Vercel - Guía Visual

## Paso 1: Crear Cuenta en Vercel (2 minutos)

1. **Abrí tu navegador** y andá a: **https://vercel.com**

2. **Click en "Sign Up"** (arriba a la derecha)

3. **Click en "Continue with GitHub"** 
   - Es lo más fácil porque ya tenés cuenta en GitHub
   - Te va a pedir autorizar a Vercel, click en "Authorize"

4. ¡Listo! Ya estás dentro de Vercel

---

## Paso 2: Importar tu Proyecto (1 minuto)

1. Una vez dentro de Vercel, click en el botón **"Add New..."** (arriba a la derecha)
   - O directamente en **"New Project"**

2. Te va a mostrar tus repositorios de GitHub. **Buscá `pilates`** en la lista

3. Si no aparece, click en **"Adjust GitHub App Permissions"** y dale todos los permisos

4. Cuando encuentres `pilates`, click en **"Import"** (botón al lado del nombre)

---

## Paso 3: Configurar el Proyecto (2 minutos)

Vercel va a detectar automáticamente que es un proyecto Vite. **NO CAMBIES NADA** en esta parte, solo:

1. Bajá hasta la sección **"Environment Variables"**
2. Click en **"Add Environment Variable"** (o similar)

### Agregar Primera Variable:
- **Name**: `VITE_SUPABASE_URL`
- **Value**: `https://qihqwzavawufsekxbnco.supabase.co`
- ✅ Marcar todas las casillas: Production, Preview, Development
- Click en **"Add"** o **"Save"**

### Agregar Segunda Variable:
- Click nuevamente en **"Add Environment Variable"**
- **Name**: `VITE_SUPABASE_ANON_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaHF3emF2YXd1ZnNla3hibmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjk3OTQsImV4cCI6MjA4MzQwNTc5NH0.DgpgRH69gl1VA16cky3Sw6zgAO9l8xMUcJKrp2_1LHw`
- ✅ Marcar todas las casillas: Production, Preview, Development
- Click en **"Add"** o **"Save"**

---

## Paso 4: Hacer Deploy (2 minutos)

1. Una vez que agregaste las 2 variables, click en el botón **"Deploy"** (abajo, normalmente verde o azul)

2. Esperá 2-3 minutos. Verás que está "Building..." y luego "Deploying..."

3. Cuando termine, verás un mensaje **"Congratulations! Your deployment has been created."**

4. Te va a mostrar una URL tipo: `https://pilates-xxxxx.vercel.app` o `https://pilates.vercel.app`

5. **¡Copiá esa URL!** Esa es la dirección de tu app en internet 🎉

---

## Paso 5: Probar desde el Celular

1. Abrí esa URL en el navegador de tu celular
2. Deberías ver tu app funcionando
3. Probá crear un alumno o actividad
4. ¡Funciona desde cualquier lugar!

---

## 🔍 Si Te Trabas en Algún Paso:

### ¿No aparece el repositorio `pilates`?
- Click en "Adjust GitHub App Permissions" y autorizá todos los permisos

### ¿No encuentro dónde agregar variables?
- Buscá una sección que diga "Environment Variables" o "Variables de Entorno"
- Normalmente está antes del botón "Deploy"

### ¿Da error al hacer deploy?
- Revisá que las variables estén bien escritas (copiá y pegá exactamente)
- Verificá que las casillas Production, Preview, Development estén marcadas

---

## 📝 Notas Importantes:

- La URL que te da Vercel es permanente (no cambia)
- Cada vez que hagas `git push`, Vercel actualiza automáticamente tu app
- Es completamente gratis para empezar

---

¡Listo! Seguí estos pasos y en 5 minutos tenés tu app funcionando en internet 🚀


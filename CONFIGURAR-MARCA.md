# Configurar nombre y logo por sucursal (ej. FITGEST)

La app usa **manifest dinámico**: al instalar la PWA se muestra el **nombre e icono del usuario con el que estás logueado** (si es FITGEST → FITGEST + logo FITGEST; si es SAVIA → SAVIA + logo SAVIA). No hace falta configurar variables de entorno para esto.

## 1. Backend: nombre y foto de la sucursal

Al hacer login, la API debe devolver en la respuesta:

- **`sucursalNombre`**: nombre que se muestra en la barra y en el título de la ventana (ej. `"FITGEST"`).
- **`fotoPerfil`**: URL de la foto/logo del estudio (se usa en el header junto al nombre).

Si tu backend ya envía estos campos al iniciar sesión, no hace falta cambiar nada: al entrar con el usuario de FITGEST verás “FITGEST” y su foto en la app y en el título de la ventana.

## 2. Build/instalación: nombre e icono de la PWA

Cuando alguien **instala** la app en el celular o en el escritorio, el nombre y el icono que ve en el launcher vienen del build. Podés configurarlos con variables de entorno:

- **`VITE_APP_NAME`**: nombre de la app instalada (ej. `FITGEST`). Sin esto sale "Sistema de Gestión".
- **`VITE_APP_ICON`**: archivo del **icono de la PWA** en `public/` (ej. `fitgest.png`). Sin esto se usa savia.png.
- **`VITE_APP_LOGO`**: ruta del logo en el header cuando no hay `fotoPerfil` (ej. `/fitgest.png`).

### Ejemplo para FITGEST

1. Subí el icono de FITGEST (ej. `fitgest.png`, 512×512 px) a **`public/`** y hacé commit.
2. En Railway → Variables → agregá `VITE_APP_NAME` = `FITGEST` y `VITE_APP_ICON` = `fitgest.png`. (Opcional: `VITE_APP_LOGO` = `/fitgest.png`.)
3. Hacé un **nuevo deploy**. Sin redeploy el nombre e icono no cambian.


Después de redeploy, al instalar la app se verá **FITGEST - Sistema de Gestión** y el **icono de FITGEST**. Si ya la tenías instalada, desinstalala y volvé a instalar para que tome el nuevo nombre e icono.

## Resumen

| Dónde se ve | De dónde sale |
|-------------|----------------|
| Título de la ventana / pestaña | Al estar logueado: `sucursalNombre` que devuelve la API. Si no hay usuario logueado: `VITE_APP_NAME` o “Sistema de Gestión”. |
| Nombre y foto en el header (barra superior) | `sucursalNombre` y `fotoPerfil` de la respuesta de login. Si no hay `fotoPerfil`, se usa `VITE_APP_LOGO` o el logo por defecto. |
| Nombre e icono de la app instalada (PWA) | `VITE_APP_NAME` y `VITE_APP_ICON` en el build (variables de entorno en Railway). |

Para que “se instale con el nombre del usuario que tenés abierto y su foto”: configurá el backend para que ese usuario (ej. fitgest) tenga `sucursalNombre` y `fotoPerfil` correctos, y para la instalación usá `VITE_APP_NAME=FITGEST` (y si querés, `VITE_APP_LOGO=/fitgest.png`) al hacer el build.

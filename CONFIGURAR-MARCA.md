# Configurar nombre y logo por sucursal (ej. FITGEST)

Para que la app muestre el **nombre y la foto del usuario/sucursal** con el que inicias sesión (por ejemplo FITGEST), y que al instalarla en el celular o PC se vea con esa marca:

## 1. Backend: nombre y foto de la sucursal

Al hacer login, la API debe devolver en la respuesta:

- **`sucursalNombre`**: nombre que se muestra en la barra y en el título de la ventana (ej. `"FITGEST"`).
- **`fotoPerfil`**: URL de la foto/logo del estudio (se usa en el header junto al nombre).

Si tu backend ya envía estos campos al iniciar sesión, no hace falta cambiar nada: al entrar con el usuario de FITGEST verás “FITGEST” y su foto en la app y en el título de la ventana.

## 2. Build/instalación: nombre e icono de la PWA

Cuando alguien **instala** la app en el celular o en el escritorio, el nombre y el icono que ve en el launcher vienen del build. Podés configurarlos con variables de entorno:

- **`VITE_APP_NAME`**: nombre que tendrá la app instalada (ej. `FITGEST`).
- **`VITE_APP_LOGO`**: ruta del logo que se usa en el header cuando la sucursal no tiene `fotoPerfil` (ej. `/fitgest.png` si ponés `fitgest.png` en la carpeta `public/`).

### Ejemplo para FITGEST

1. Poné el logo de FITGEST en `public/fitgest.png`.
2. Al construir o desplegar, usá:

```bash
VITE_APP_NAME=FITGEST VITE_APP_LOGO=/fitgest.png npm run build
```

O en tu plataforma (Railway, Vercel, etc.) definí:

- `VITE_APP_NAME` = `FITGEST`
- `VITE_APP_LOGO` = `/fitgest.png`

Así, al instalar la PWA se verá “FITGEST - Sistema de Gestión” y, si el backend no manda `fotoPerfil`, se usará el logo de FITGEST en el header.

## Resumen

| Dónde se ve | De dónde sale |
|-------------|----------------|
| Título de la ventana / pestaña | Al estar logueado: `sucursalNombre` que devuelve la API. Si no hay usuario logueado: `VITE_APP_NAME` o “Sistema de Gestión”. |
| Nombre y foto en el header (barra superior) | `sucursalNombre` y `fotoPerfil` de la respuesta de login. Si no hay `fotoPerfil`, se usa `VITE_APP_LOGO` o el logo por defecto. |
| Nombre e icono de la app instalada (PWA) | `VITE_APP_NAME` (y opcionalmente el icono del manifest) en el build. |

Para que “se instale con el nombre del usuario que tenés abierto y su foto”: configurá el backend para que ese usuario (ej. fitgest) tenga `sucursalNombre` y `fotoPerfil` correctos, y para la instalación usá `VITE_APP_NAME=FITGEST` (y si querés, `VITE_APP_LOGO=/fitgest.png`) al hacer el build.

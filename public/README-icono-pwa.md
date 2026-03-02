# Iconos de la app instalada (PWA)

La PWA usa **manifest dinámico**: al instalar, se muestra el nombre e icono del usuario con el que estás logueado.

- **fitgest.png**: logo de FITGEST (ya incluido). Si entrás con usuario FITGEST y hacés "Instalar la app", se usa este icono.
- **savia.png**: logo de SAVIA. Si entrás con usuario SAVIA (o sin sesión), se usa este icono.

Para agregar otra marca: poné `nombre.png` en esta carpeta y en el backend (server/index.js) agregá ese nombre a la lista de brands en la ruta `/api/manifest.webmanifest`. El nombre de la sucursal (ej. "Prueba") se convierte en slug "prueba"; si hay `prueba.png` y está en la lista, se usará.

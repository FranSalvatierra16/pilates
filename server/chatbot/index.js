import express from 'express';
import { menuPrincipal, menuAlumno } from './menu.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { telefono, mensaje } = req.body || {};

  console.log('📲', telefono);
  console.log('💬', mensaje);

  let respuesta;

  switch ((mensaje || '').trim()) {
    case '1':
      respuesta = `💚 Savia Pilates es un entrenamiento en formato circuito donde trabajás con Reformer, Chair, Barril y Unidad de Pared.

Podés enfocarte en fuerza, movilidad, postura o rehabilitación.

🎁 Además tenés una clase de prueba gratuita.`;
      break;

    case '2':
      respuesta = menuAlumno();
      break;

    case '3':
      respuesta = `😊 En unos minutos una profesora se va a comunicar con vos.`;
      break;

    default:
      respuesta = menuPrincipal();
  }

  return res.json({
    ok: true,
    reply: respuesta,
  });
});

export default router;
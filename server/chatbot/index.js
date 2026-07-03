const express = require("express");

const router = express.Router();

router.post("/", async (req, res) => {
    const { telefono, mensaje } = req.body;

    console.log("WhatsApp:", telefono);
    console.log("Mensaje:", mensaje);

    return res.json({
        ok: true,
        reply: "🌿 Hola! Bienvenido a Savia Pilates."
    });
});

module.exports = router;
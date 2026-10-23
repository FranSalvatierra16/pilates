#!/usr/bin/env python3
"""Tutorial mudo, vertical, de cómo el alumno carga la ficha de salud."""
import subprocess
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FPS = 24
OUT = "/Users/fransalva/workspace/pilates-railway/tutorial-ficha-salud.mp4"
LOGO = "/Users/fransalva/workspace/pilates-railway/public/savia.png"

CREAM = (243, 237, 228)
CREAM2 = (250, 247, 242)
WHITE = (255, 255, 255)
INK = (61, 52, 44)
MUTED = (122, 111, 100)
TERRA = (143, 102, 76)
TERRA_DEEP = (111, 78, 55)
OLIVE = (118, 129, 88)
OLIVE_DEEP = (92, 102, 68)
OLIVE_SOFT = (228, 232, 216)
SAND = (232, 223, 208)
SAND_LINE = (201, 178, 141)
AMBER = (255, 248, 230)

FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONTB = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def font(size, bold=False):
    return ImageFont.truetype(FONTB if bold else FONT, size)

F_H1 = font(72, True)
F_H2 = font(54, True)
F_UI = font(40, True)
F_BODY = font(36)
F_SM = font(30)
F_XS = font(26)
F_CAP = font(48, True)
F_STEP = font(28, True)
F_BTN = font(42, True)

def clamp(t):
    return max(0.0, min(1.0, t))

def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)

def rr(d, box, r, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def text_w(txt, fnt):
    return fnt.getlength(txt)

def wrap(txt, fnt, max_w):
    lines, cur = [], ""
    for word in txt.split():
        trial = (cur + " " + word).strip()
        if fnt.getlength(trial) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines

def center_lines(d, lines, fnt, y, fill, gap=12):
    for line in lines:
        w = text_w(line, fnt)
        d.text(((W - w) / 2, y), line, font=fnt, fill=fill)
        y += fnt.size + gap
    return y

def circle_logo(size):
    src = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(src, (0, 0), mask)
    return out

LOGO_LG = circle_logo(220)
LOGO_SM = circle_logo(88)

def base():
    im = Image.new("RGB", (W, H), CREAM)
    return im, ImageDraw.Draw(im)

def caption(d, paso, total, texto):
    rr(d, (0, H - 340, W, H), 0, INK)
    label = f"PASO  {paso}  DE  {total}"
    lw = text_w(label, F_STEP)
    d.text(((W - lw) / 2, H - 310), label, font=F_STEP, fill=SAND_LINE)
    lines = wrap(texto, F_CAP, W - 120)
    y = H - 250
    for line in lines[:3]:
        w = text_w(line, F_CAP)
        d.text(((W - w) / 2, y), line, font=F_CAP, fill=WHITE)
        y += 58

def icon_refresh(d, box, color):
    x0, y0, x1, y1 = box
    d.arc((x0 + 18, y0 + 18, x1 - 18, y1 - 18), 30, 300, fill=color, width=5)
    d.polygon([(x1 - 30, y0 + 22), (x1 - 16, y0 + 38), (x1 - 40, y0 + 40)], fill=color)

def icon_user(d, box, color):
    x0, y0, x1, y1 = box
    cx = (x0 + x1) / 2
    d.ellipse((cx - 12, y0 + 16, cx + 12, y0 + 40), outline=color, width=5)
    d.arc((cx - 22, y0 + 44, cx + 22, y1 - 8), 200, 340, fill=color, width=5)

def icon_heart(d, box, color):
    x0, y0, x1, y1 = box
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2 + 2
    d.ellipse((cx - 16, cy - 14, cx, cy + 2), fill=color)
    d.ellipse((cx, cy - 14, cx + 16, cy + 2), fill=color)
    d.polygon([(cx - 15, cy - 2), (cx + 15, cy - 2), (cx, cy + 16)], fill=color)

def tap(d, x, y, t_press):
    """Círculo que se agranda cuando t_press va de 0 a 1."""
    if t_press <= 0:
        return
    p = ease(t_press)
    r = 34 + 22 * p
    d.ellipse((x - r, y - r, x + r, y + r), outline=TERRA, width=7)

def header(im, d, title):
    im.paste(LOGO_SM, (56, 64), LOGO_SM)
    d.text((168, 78), "Savia", font=F_H2, fill=INK)
    d.text((168, 138), title, font=F_SM, fill=MUTED)

def card(d, box, fill=WHITE, outline=SAND_LINE):
    rr(d, box, 36, fill, outline, 3)

def scene_intro(t):
    im, d = base()
    im.paste(LOGO_LG, ((W - 220) // 2, 280), LOGO_LG)
    center_lines(d, ["SAVIA"], font(42, True), 530, TERRA, 8)
    y = 680
    y = center_lines(d, wrap("Cómo cargar tu ficha de salud", F_H1, 900), F_H1, y, INK, 16)
    y += 30
    center_lines(d, wrap("Mirá estos pasos. Son menos de un minuto.", F_BODY, 820), F_BODY, y, MUTED, 10)
    # aparece suave
    if t < 0.4:
        fade = Image.new("RGB", (W, H), CREAM)
        im = Image.blend(fade, im, ease(t / 0.4))
    return im

def scene_dni(t):
    im, d = base()
    header(im, d, "Tu clase")
    im.paste(LOGO_LG, ((W - 220) // 2, 230), LOGO_LG)
    tw = text_w("Savia", font(64, True))
    d.text(((W - tw) / 2, 470), "Savia", font=font(64, True), fill=INK)
    sub = "Pilates"
    d.text(((W - text_w(sub, font(40))) / 2, 545), sub, font=font(40), fill=TERRA)
    hint = wrap("Ingresá tu DNI para ver tus clases.", F_SM, 760)
    center_lines(d, hint, F_SM, 620, MUTED, 6)

    card(d, (80, 760, W - 80, 1180))
    d.text((120, 800), "DNI", font=F_UI, fill=INK)
    rr(d, (120, 870, W - 120, 980), 24, CREAM2, SAND_LINE, 3)
    digits = "30123456"
    n = int(ease(clamp((t - 0.7) / 1.6)) * len(digits))
    shown = digits[:n] if n else "Ej. 12345678"
    color = INK if n else MUTED
    d.text((150, 895), shown, font=F_UI, fill=color)

    pressed = 2.8 < t < 3.4
    btn_c = TERRA_DEEP if pressed else TERRA
    rr(d, (120, 1020, W - 120, 1130), 28, btn_c)
    label = "Entrar"
    d.text(((W - text_w(label, F_BTN)) / 2, 1048), label, font=F_BTN, fill=WHITE)
    if 2.5 < t < 3.6:
        tap(d, W / 2, 1075, clamp((t - 2.5) / 0.5))
    caption(d, 1, 4, "Abrí el link del estudio y poné tu DNI.")
    return im

def scene_home(t):
    im, d = base()
    header(im, d, "Inicio")
    d.text((70, 220), "Hola", font=font(70, True), fill=INK)
    q = "¿Qué querés hacer?"
    d.text((70, 320), q, font=font(48), fill=TERRA)

    card(d, (56, 460, W - 56, 760))
    rr(d, (96, 510, 196, 610), 28, TERRA)
    icon_refresh(d, (96, 510, 196, 610), WHITE)
    d.text((230, 515), "Liberar / Recuperar", font=F_UI, fill=INK)
    d.text((230, 575), "Liberá si no vas y anotate", font=F_SM, fill=MUTED)
    d.text((230, 620), "a otro horario.", font=F_SM, fill=MUTED)

    hot = 1.1 < t
    card(d, (56, 800, W - 56, 1120), fill=OLIVE_SOFT if hot else WHITE, outline=OLIVE if hot else SAND_LINE)
    rr(d, (96, 860, 196, 960), 28, OLIVE)
    icon_user(d, (96, 860, 196, 960), WHITE)
    d.text((230, 850), "Mi perfil", font=F_H2, fill=INK)
    sub = wrap("Completá tu ficha de salud antes de empezar.", F_SM, 720)
    y = 930
    for line in sub:
        d.text((230, y), line, font=F_SM, fill=MUTED)
        y += 40
    if 2.4 < t < 3.5:
        tap(d, 960, 900, clamp((t - 2.4) / 0.55))
    caption(d, 2, 4, "Entrá a Mi perfil.")
    return im

def scene_perfil(t, completa=False):
    im, d = base()
    header(im, d, "Perfil")
    d.text((70, 210), "Mi perfil", font=font(64, True), fill=INK)
    hot = (not completa) and t > 0.6
    fill = OLIVE_SOFT if hot else WHITE
    outline = OLIVE if hot else SAND_LINE
    card(d, (56, 340, W - 56, 620), fill=fill, outline=outline)
    rr(d, (96, 400, 206, 510), 28, OLIVE)
    icon_heart(d, (96, 400, 206, 510), WHITE)
    d.text((240, 400), "Ficha de salud", font=F_UI, fill=INK)
    msg = "Ya está completa. Entrá para verla o cambiarla." if completa else "Entrá para completarla."
    for i, line in enumerate(wrap(msg, F_SM, 700)):
        d.text((240, 465 + i * 40), line, font=F_SM, fill=MUTED)
    d.text((W - 130, 445), "›", font=font(64, True), fill=MUTED)
    if (not completa) and 2.2 < t < 3.3:
        tap(d, W - 140, 480, clamp((t - 2.2) / 0.5))
    if completa:
        rr(d, (80, 700, W - 80, 860), 28, OLIVE_SOFT, OLIVE, 3)
        ok = "Ficha de salud guardada"
        d.text(((W - text_w(ok, F_UI)) / 2, 748), ok, font=F_UI, fill=OLIVE_DEEP)
    caption(d, 4 if completa else 3, 4, "Listo. Tu ficha ya quedó cargada." if completa else "Tocá Ficha de salud.")
    return im

def scene_form(t):
    im, d = base()
    header(im, d, "Ficha de salud")
    d.text((70, 200), "Ficha de salud", font=font(52, True), fill=INK)
    d.text((70, 270), "Información confidencial", font=F_SM, fill=TERRA)

    # cuatro momentos
    if t < 2.4:
        panel_datos(d, t)
        cap = "Completá la fecha y el contacto de emergencia."
    elif t < 4.6:
        panel_antecedentes(d, t - 2.4)
        cap = "Marcá lo que corresponda. Si no tenés nada, elegí Ninguna."
    elif t < 6.6:
        panel_preguntas(d, t - 4.6)
        cap = "Respondé las preguntas. Si es sí, contá cuál."
    else:
        panel_guardar(d, t - 6.6)
        cap = "Aceptá la declaración y tocá Guardar ficha."
    caption(d, 4, 4, cap)
    return im

def field(d, y, label, value, placeholder, filled):
    d.text((100, y), label, font=F_SM, fill=INK)
    rr(d, (100, y + 48, W - 100, y + 148), 24, WHITE, SAND_LINE, 3)
    d.text((130, y + 74), value if filled else placeholder, font=F_BODY, fill=INK if filled else MUTED)

def panel_datos(d, t):
    card(d, (56, 360, W - 56, 1280))
    d.text((100, 400), "Fecha", font=F_SM, fill=INK)
    rr(d, (100, 448, W - 100, 548), 24, WHITE, SAND_LINE, 3)
    d.text((130, 474), "23/10/2026", font=F_BODY, fill=INK)
    name_on = t > 0.5
    phone_on = t > 1.3
    field(d, 590, "Contacto de emergencia", "Ana Gómez" if name_on else "", "Nombre", name_on)
    field(d, 820, "Teléfono del contacto", "11 5555 4444" if phone_on else "", "Teléfono", phone_on)

def chip(d, x, y, w, h, label, on):
    rr(d, (x, y, x + w, y + h), 18, OLIVE if on else WHITE, OLIVE if on else SAND_LINE, 3)
    fnt = F_SM
    d.text((x + 28, y + 22), label, font=fnt, fill=WHITE if on else INK)

def panel_antecedentes(d, t):
    card(d, (56, 360, W - 56, 1320))
    d.text((100, 410), "Antecedentes de salud", font=F_UI, fill=INK)
    d.text((100, 470), "Marcá las opciones que correspondan.", font=F_SM, fill=MUTED)
    on = t > 1.15
    items = ["Hipertensión", "Diabetes", "Columna o hernia", "Lesión o cirugía"]
    y = 560
    for item in items:
        chip(d, 100, y, W - 200, 84, item, False)
        y += 104
    chip(d, 100, y, W - 200, 84, "Ninguna", on)
    if 0.9 < t < 1.7:
        tap(d, W - 180, y + 42, clamp((t - 0.9) / 0.45))

def choice(d, x, y, w, label, on):
    rr(d, (x, y, x + w, y + 90), 22, OLIVE if on else WHITE, OLIVE if on else SAND_LINE, 3)
    tw = text_w(label, F_UI)
    d.text((x + (w - tw) / 2, y + 24), label, font=F_UI, fill=WHITE if on else INK)

def panel_preguntas(d, t):
    card(d, (56, 360, W - 56, 1180))
    d.text((100, 410), "¿Tenés dolor o molestias?", font=F_BODY, fill=INK)
    on = t > 0.7
    gap = 24
    bw = (W - 200 - gap) // 2
    choice(d, 100, 490, bw, "Sí", False)
    choice(d, 100 + bw + gap, 490, bw, "No", on)
    if 0.45 < t < 1.15:
        tap(d, 100 + bw + gap + bw / 2, 535, clamp((t - 0.45) / 0.4))
    d.text((100, 640), "¿Tomás medicación?", font=F_BODY, fill=INK)
    on2 = t > 1.35
    choice(d, 100, 720, bw, "Sí", False)
    choice(d, 100 + bw + gap, 720, bw, "No", on2)
    if 1.1 < t < 1.75:
        tap(d, 100 + bw + gap + bw / 2, 765, clamp((t - 1.1) / 0.4))
    note = wrap("Si respondés que sí, escribí cuál es.", F_SM, W - 220)
    y = 860
    for line in note:
        d.text((100, y), line, font=F_SM, fill=MUTED)
        y += 40

def panel_guardar(d, t):
    card(d, (56, 360, W - 56, 1100))
    d.text((100, 410), "Declaración", font=F_UI, fill=INK)
    lines = wrap("Declaro que la información es verdadera y aviso si algo cambia.", F_SM, W - 280)
    y = 480
    for line in lines:
        d.text((180, y), line, font=F_SM, fill=INK)
        y += 40
    checked = t > 0.55
    rr(d, (100, 470, 160, 530), 10, OLIVE if checked else WHITE, OLIVE if checked else SAND_LINE, 3)
    if checked:
        d.line((112, 502, 128, 522), fill=WHITE, width=6)
        d.line((128, 522, 150, 484), fill=WHITE, width=6)
    if 0.25 < t < 0.9:
        tap(d, 130, 500, clamp((t - 0.25) / 0.4))
    pressed = 1.35 < t < 1.9
    rr(d, (100, 860, W - 100, 980), 30, TERRA_DEEP if pressed else OLIVE)
    label = "Guardar ficha"
    d.text(((W - text_w(label, F_BTN)) / 2, 894), label, font=F_BTN, fill=WHITE)
    if 1.15 < t < 2.0:
        tap(d, W / 2, 920, clamp((t - 1.15) / 0.45))

# (inicio, fin, funcion que recibe tiempo local)
SCENES = [
    (0.0, 3.2, scene_intro),
    (3.2, 8.0, scene_dni),
    (8.0, 12.2, scene_home),
    (12.2, 16.2, lambda t: scene_perfil(t, False)),
    (16.2, 25.2, scene_form),
    (25.2, 29.2, lambda t: scene_perfil(min(t, 3.2), True)),
]

def scene_at(t):
    for i, (a, b, fn) in enumerate(SCENES):
        if a <= t < b:
            im = fn(t - a)
            # fundido de 0.25 s con la escena anterior
            if i and t - a < 0.28:
                prev_a, prev_b, prev_fn = SCENES[i - 1]
                prev = prev_fn(prev_b - prev_a - 0.05)
                im = Image.blend(prev, im, ease((t - a) / 0.28))
            return im
    return SCENES[-1][2](3)

def main():
    n = int(FPS * SCENES[-1][1])
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
        "-movflags", "+faststart",
        OUT,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for i in range(n):
            im = scene_at(i / FPS).convert("RGB")
            proc.stdin.write(im.tobytes())
    finally:
        proc.stdin.close()
        proc.wait()
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)
    print(OUT, n / FPS)

if __name__ == "__main__":
    main()

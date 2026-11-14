import os, json, time, secrets, hashlib, hmac
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import httpx, psutil
from fastapi import FastAPI, Request, Form, Depends, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import create_engine, String, Integer, Boolean, DateTime, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session

APP_NAME = "ITKODERS SUPER ADMIN"
DB_URL = os.getenv("DATABASE_URL", "")
if not DB_URL:
    raise RuntimeError("DATABASE_URL sozlanmagan")
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg://", 1)
SECRET = os.getenv("SECRET_KEY", "")
if len(SECRET) < 32:
    raise RuntimeError("SECRET_KEY kamida 32 belgidan iborat bo‘lishi kerak")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"
engine = create_engine(DB_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "sa_users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(24), default="viewer")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    permissions: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
class Project(Base):
    __tablename__ = "sa_projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(140), index=True)
    kind: Mapped[str] = mapped_column(String(40), default="web")
    repo_url: Mapped[str] = mapped_column(String(500), default="")
    service_url: Mapped[str] = mapped_column(String(500), default="")
    render_service_id: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
class Audit(Base):
    __tablename__ = "sa_audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(120))
    detail: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

Base.metadata.create_all(engine)
with engine.begin() as conn:
    conn.exec_driver_sql("ALTER TABLE sa_users ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT '{}' ")
app = FastAPI(title=APP_NAME, docs_url=None, redoc_url=None)
app.add_middleware(SessionMiddleware, secret_key=SECRET, session_cookie="itkoders_sa", max_age=28800,
                   same_site="strict", https_only=COOKIE_SECURE)

def db_dep():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return salt.hex() + "$" + key.hex()
def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, key_hex = stored.split("$", 1)
        key = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception: return False

def audit(db: Session, actor: str, action: str, detail: str, request: Request):
    ip = request.client.host if request.client else "noma’lum"
    db.add(Audit(actor=actor, action=action, detail=detail[:1500], ip=ip))
    db.commit()

def user_dep(request: Request, db: Session = Depends(db_dep)):
    uid = request.session.get("uid")
    if not uid: raise HTTPException(401, "Tizimga kiring")
    user = db.get(User, int(uid))
    if not user or not user.active:
        request.session.clear()
        raise HTTPException(401, "Hisob faol emas")
    return user

def role_dep(*roles):
    def check(user: User = Depends(user_dep)):
        if user.role not in roles: raise HTTPException(403, "Bu amal uchun huquqingiz yo‘q")
        return user
    return check

PERMISSION_LABELS = {
    "dashboard.view": "Umumiy ko‘rinish",
    "projects.view": "Loyihalarni ko‘rish",
    "projects.manage": "Loyiha qo‘shish va to‘xtatish",
    "projects.deploy": "Loyihalarni deploy / yangilash",
    "projects.import": "Render xizmatlarini import qilish",
    "servers.view": "Server monitoring",
    "team.view": "Jamoa ro‘yxatini ko‘rish",
    "audit.view": "Xavfsizlik va audit jurnali",
    "ai.view": "Sun’iy intellekt holati",
    "backup.create": "Zaxira nusxasini olish",
    "backup.restore": "Zaxiradan tiklash"
}
LEGACY_PERMISSIONS = {
    "admin": {"dashboard.view", "projects.view", "projects.manage", "projects.import", "servers.view", "audit.view"},
    "operator": {"dashboard.view", "projects.view", "servers.view"},
    "viewer": {"dashboard.view", "projects.view", "servers.view"}
}
def get_permissions(user: User):
    if user.role == "owner":
        return set(PERMISSION_LABELS)
    if user.role == "helper":
        try:
            stored = json.loads(user.permissions or "{}")
            return {p for p in stored if p in PERMISSION_LABELS} if isinstance(stored, list) else set()
        except Exception:
            return set()
    return set(LEGACY_PERMISSIONS.get(user.role, set()))
def has_permission(user: User, permission: str):
    return user.role == "owner" or permission in get_permissions(user)
def permission_dep(permission: str):
    def check(user: User = Depends(user_dep)):
        if not has_permission(user, permission):
            raise HTTPException(403, "Super Admin bu bo‘lim uchun ruxsat bermagan")
        return user
    return check

def verify_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Xavfsizlik tekshiruvi rad etdi")

def bootstrap():
    username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "owner").strip()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if len(password) < 16:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD kamida 16 belgidan iborat bo‘lsin")
    db = SessionLocal()
    try:
        if not db.query(User).filter_by(username=username).first():
            db.add(User(username=username, password_hash=hash_password(password), role="owner"))
            db.commit()
        # Import existing Render services/repositories as starter inventory only once.
        if db.query(Project).count() == 0:
            seed = [
                ("NEURON — Veb", "web", "https://github.com/itkoders/Neyroun", "https://neuron-web-jnp5.onrender.com", "srv-dbkqif6gekts73etdt90"),
                ("NEURON — API", "api", "https://github.com/itkoders/Neyroun", "https://neuron-api-ebnq.onrender.com", "srv-dbkqidlg1s2s73dgmdc0"),
                ("TILAKINO — Yangi", "bot", "https://github.com/itkoders/Yangi", "https://tilakino-yangi.onrender.com", "srv-dbic2uom7kps73cfniqg"),
                ("TILAKINO — Bot V2", "bot", "https://github.com/itkoders/Tila-kino", "https://tilakino-telegram-bot-v2.onrender.com", "srv-dbhinjuc6qcc73fhaqr0"),
                ("TILAKINO — Eski xizmat", "bot", "https://github.com/itkoders/Tila-kino", "https://tilakino-telegram-bot.onrender.com", "srv-dbgukt6i0phs73aa1bbg"),
            ]
            for row in seed: db.add(Project(name=row[0], kind=row[1], repo_url=row[2], service_url=row[3], render_service_id=row[4]))
            db.commit()
    finally: db.close()
bootstrap()

def page_shell(title, body, user=None, active=""):
    nav = [
        ("umumiy", "◈", "Umumiy ko‘rinish", "/"),
        ("loyihalar", "▦", "Loyihalar", "/#loyihalar"),
        ("serverlar", "◉", "Serverlar", "/#serverlar"),
        ("jamoa", "♙", "Jamoa", "/#jamoa"),
        ("xavfsizlik", "⬡", "Xavfsizlik va jurnal", "/#jurnal"),
        ("suniy", "✧", "Sun’iy intellekt", "/#suniy"),
        ("zaxira", "▤", "Zaxira nusxa", "/#zaxira"),
    ]
    links = "".join(f'<a class="nav {"sel" if active==key else ""}" href="{url}"><span>{ico}</span>{label}</a>' for key,ico,label,url in nav)
    who = f'<span class="who">{user.username} · {user.role}</span>' if user else ""
    return f"""<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#080d18"><title>{title}</title>
<style>
:root{{--bg:#080d18;--panel:#101a2a;--panel2:#142238;--line:#243650;--muted:#91a4c0;--text:#edf4ff;--gold:#e9bd68;--cyan:#62d9dc;--green:#65d6a3;--red:#ff7887;--radius:19px}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:radial-gradient(ellipse at 70% -10%,#18314a 0,transparent 38%),var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh}}
a{{color:inherit;text-decoration:none}}button,input,select,textarea{{font:inherit}}.app{{display:grid;grid-template-columns:252px minmax(0,1fr);min-height:100vh}}.side{{position:sticky;top:0;height:100vh;padding:24px 16px;background:#0b1422eF;border-right:1px solid #1d2d44;display:flex;flex-direction:column;z-index:5}}
.brand{{display:flex;align-items:center;gap:11px;padding:3px 8px 28px}}.brandmark{{width:39px;height:39px;border-radius:13px;background:linear-gradient(145deg,#f4d18a,#98672d);display:grid;place-items:center;color:#101521;font-size:20px;font-weight:900;box-shadow:0 8px 25px #d9a44c2b}}.brand b{{font-size:13px;letter-spacing:1.4px}}.brand small{{display:block;color:var(--muted);font-size:10px;letter-spacing:2px;margin-top:2px}}
.navcap{{color:#60738f;font-size:10px;letter-spacing:1.8px;padding:12px 11px 6px}}.nav{{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;color:#9fb0c8;margin:3px 0;transition:.2s}}.nav span{{width:22px;text-align:center;color:#8da5c3;font-size:17px}}.nav:hover,.nav.sel{{background:linear-gradient(90deg,#1b3550,#14253a);color:#fff}}.nav.sel span{{color:var(--gold)}}.sidefoot{{margin-top:auto;border-top:1px solid #1d2c41;padding:17px 8px 0;color:#70829d;font-size:11px}}
.main{{min-width:0;padding:27px clamp(16px,3vw,42px) 100px;max-width:1600px;width:100%;margin:0 auto}}.top{{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:26px}}.eyebrow{{color:var(--cyan);font-size:10px;letter-spacing:2px;font-weight:800}}h1{{font-size:clamp(23px,3vw,32px);line-height:1.15;margin:5px 0 0;letter-spacing:-.8px}}h2{{font-size:17px;margin:0 0 5px}}h3{{font-size:14px;margin:0}}.sub{{color:var(--muted);font-size:12px;margin-top:5px}}.topright{{display:flex;align-items:center;gap:10px}}.who{{font-size:11px;color:#b8c7dd;background:#142239;border:1px solid #263b57;border-radius:30px;padding:8px 12px}}.btn{{border:0;border-radius:11px;padding:10px 14px;background:linear-gradient(135deg,#f0cd84,#d7a950);color:#19150e;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}}.btn:hover{{filter:brightness(1.08);transform:translateY(-1px)}}.btn.secondary{{background:#1a2b43;color:#dce9fa;border:1px solid #304764}}.btn.danger{{background:#47232e;color:#ffc0c6;border:1px solid #713644}}.btn.small{{padding:7px 10px;font-size:11px}}.logout{{background:transparent;border:1px solid #34445b;color:#b9c7db;border-radius:10px;padding:8px 11px}}
.grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}}.stat,.card{{background:linear-gradient(145deg,#111e30,#0f1928);border:1px solid #24354d;border-radius:var(--radius);padding:17px;box-shadow:0 12px 35px #00000015}}.stat{{position:relative;overflow:hidden;min-height:112px}}.stat:after{{content:"";position:absolute;width:90px;height:90px;border-radius:50%;right:-40px;top:-40px;background:#4bc7d51a}}.statlabel{{color:#91a4bd;font-size:11px}}.statnum{{font-size:29px;font-weight:800;letter-spacing:-1px;margin-top:6px}}.statfoot{{font-size:10px;color:#6f829f;margin-top:2px}}.section{{margin-top:23px;scroll-margin-top:20px}}.sectionhead{{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}}.sectionhead p{{margin:3px 0 0;color:var(--muted);font-size:11px}}
.cards{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}.project{{padding:15px;border:1px solid #273a54;background:#111d2d;border-radius:15px;min-width:0}}.projecttop{{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}}.projectname{{font-weight:800;font-size:14px;overflow-wrap:anywhere}}.kind{{font-size:10px;color:#8da3c0;margin-top:3px}}.status{{white-space:nowrap;border-radius:30px;padding:4px 8px;font-size:10px;background:#173b32;color:#84e0b4}}.status.off{{background:#422630;color:#ffb6c0}}.projectmeta{{font-size:10px;color:#8397b4;overflow-wrap:anywhere;margin-top:8px}}.actions{{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}}
.formgrid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}}label{{display:block;color:#aebed4;font-size:11px}}input,select,textarea{{width:100%;margin-top:6px;background:#0a1422;border:1px solid #2b405d;color:#edf4ff;border-radius:10px;padding:11px 12px;outline:none;min-width:0}}input:focus,select:focus,textarea:focus{{border-color:#54cbd2;box-shadow:0 0 0 3px #54cbd21b}}textarea{{min-height:76px;resize:vertical}}.full{{grid-column:1/-1}}.hint{{font-size:10px;color:#7e91ac;margin-top:5px}}.tablewrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;min-width:520px}}th,td{{text-align:left;padding:11px 9px;border-bottom:1px solid #26364d;font-size:11px}}th{{color:#8498b5;font-weight:600}}td{{color:#d5e0ef}}.muted{{color:var(--muted)}}.logrow{{padding:10px 0;border-bottom:1px solid #26364d;font-size:11px}}.logrow:last-child{{border:0}}.pill{{display:inline-block;border-radius:30px;padding:3px 8px;background:#1a2c43;color:#b8cbe4;font-size:10px}}.notice{{padding:12px 14px;border:1px solid #34506b;border-radius:12px;background:#13253a;color:#b7cbe4;font-size:11px;margin:14px 0}}.notice.warn{{border-color:#775a32;background:#302719;color:#f4d59b}}.empty{{padding:24px;text-align:center;color:#8193ad;border:1px dashed #2b405a;border-radius:14px;font-size:12px}}
.mobilebar{{display:none}}.modal{{display:none;position:fixed;inset:0;background:#0009;z-index:20;align-items:center;justify-content:center;padding:16px}}.modal.open{{display:flex}}.modalbox{{width:min(520px,100%);background:#101b2b;border:1px solid #304561;border-radius:18px;padding:20px;max-height:90vh;overflow:auto}}.modalhead{{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}}.x{{border:0;background:#20324b;color:#fff;border-radius:9px;padding:7px 11px}}
@media(max-width:1050px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
@media(max-width:760px){{.permgrid{{grid-template-columns:1fr}}.app{{display:block}}.side{{display:none}}.main{{padding:18px 14px 100px}}.top{{align-items:flex-start}}.topright{{flex-direction:column;align-items:flex-end}}.who{{display:none}}.cards{{grid-template-columns:1fr}}.grid{{gap:9px}}.stat{{padding:13px;min-height:100px}}.statnum{{font-size:25px}}.formgrid{{grid-template-columns:1fr}}.full{{grid-column:auto}}.mobilebar{{position:fixed;display:flex;bottom:0;left:0;right:0;z-index:10;padding:8px 7px calc(8px + env(safe-area-inset-bottom));background:#0b1424f5;backdrop-filter:blur(16px);border-top:1px solid #263a54;justify-content:space-around}}.mobilebar a{{display:flex;flex-direction:column;align-items:center;gap:2px;color:#8ea2bd;font-size:9px;min-width:48px}}.mobilebar a b{{font-size:17px;font-weight:500}}.mobilebar a:active{{color:var(--gold)}}.permgrid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0 16px}}.permcheck{{display:flex;align-items:center;gap:8px;background:#0d1929;border:1px solid #2a3d57;border-radius:10px;padding:9px;font-size:11px;min-height:42px}}.permcheck input{{width:16px;height:16px;margin:0;accent-color:#e9bd68;flex:none}}.helper-edit{{border-top:1px solid #26364d;padding-top:14px;margin-top:14px}}.top h1{{font-size:24px}}.sectionhead{{align-items:flex-start}}}}
@media(max-width:380px){{.grid{{grid-template-columns:1fr 1fr}}.statnum{{font-size:22px}}.topright .btn{{font-size:10px;padding:8px}}}}
</style></head><body>{body}<nav class="mobilebar"><a href="/"><b>◈</b>Asosiy</a><a href="/#loyihalar"><b>▦</b>Loyihalar</a><a href="/#serverlar"><b>◉</b>Serverlar</a><a href="/#jamoa"><b>♙</b>Jamoa</a><a href="/#jurnal"><b>▤</b>Jurnal</a></nav></body></html>"""

def dashboard_html(request: Request, user: User, db: Session):
    can = lambda permission: has_permission(user, permission)
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    logs = db.query(Audit).order_by(Audit.created_at.desc()).limit(12).all()
    users = db.query(User).order_by(User.created_at.desc()).all()
    project_cards = []
    for p in projects:
        status_class = "" if p.active else "off"
        status_text = "FAOL" if p.active else "PAUZA"
        toggle_text = "To‘xtatish" if p.active else "Faollashtirish"
        deploy_btn = f'<form method="post" action="/projects/{p.id}/deploy"><button class="btn small">Yangilash ↗</button></form>' if can("projects.deploy") and p.render_service_id else ""
        project_cards.append(
            f'<article class="project"><div class="projecttop"><div><div class="projectname">{esc(p.name)}</div><div class="kind">{esc(p.kind.upper())} · ID #{p.id}</div></div><span class="status {status_class}">{status_text}</span></div><div class="projectmeta">GitHub: {esc(p.repo_url or "ulanmagan")}<br>Manzil: {esc(p.service_url or "kiritilmagan")}<br>Render ID: {esc(p.render_service_id or "kiritilmagan")}</div><div class="actions">{f'<button class="btn secondary small" onclick="checkProject({p.id},this)">Holatini tekshirish</button>' if can("projects.view") else ''}{f'<form method="post" action="/projects/{p.id}/toggle"><button class="btn secondary small">{toggle_text}</button></form>' if can("projects.manage") else ''}{deploy_btn}</div></article>'
        )
    project_cards_html = "".join(project_cards) or '<div class="empty">Hali loyiha ulanmagan. Birinchi loyihangizni qo‘shing.</div>'
    project_tools = ('<button class="btn secondary" onclick="importRender()">Renderdan yuklash ↻</button>' if can("projects.import") else '') + ('<button class="btn" onclick="document.getElementById(\'addmodal\').classList.add(\'open\')">＋ Loyiha ulash</button>' if can("projects.manage") else '')
    projects_section = f"""<section class="section" id="loyihalar"><div class="sectionhead"><div><h2>Loyihalar markazi</h2><p>Saytlar, botlar, ilovalar va API xizmatlari.</p></div><div class="actions">{project_tools}</div></div><div class="cards">{project_cards_html}</div></section>""" if can("projects.view") else ""
    server_section = """<section class="section" id="serverlar"><div class="sectionhead"><div><h2>Server monitoring</h2><p>Ushbu boshqaruv xizmatining o‘z resurslari.</p></div><button class="btn secondary small" onclick="loadMetrics()">Yangilash</button></div><div class="grid"><div class="card"><div class="statlabel">Protsessor</div><div class="statnum" id="cpu">—</div><div class="statfoot">CPU bandligi</div></div><div class="card"><div class="statlabel">Xotira</div><div class="statnum" id="ram">—</div><div class="statfoot">RAM ishlatilishi</div></div><div class="card"><div class="statlabel">Disk</div><div class="statnum" id="disk">—</div><div class="statfoot">Disk bandligi</div></div><div class="card"><div class="statlabel">Render ulanishi</div><div class="statnum" id="render">—</div><div class="statfoot">API kaliti sozlangan bo‘lsa</div></div></div></section>""" if can("servers.view") else ""
    team_section = ""
    if user.role == "owner" or can("team.view"):
        rows = "".join(f'<tr><td>{esc(u.username)}</td><td><span class="pill">{esc("Super Admin" if u.role == "owner" else "Yordamchi admin" if u.role == "helper" else u.role)}</span></td><td>{esc(", ".join(sorted(get_permissions(u))) or "—")}</td><td>{"Faol" if u.active else "Bloklangan"}</td><td>{u.created_at.strftime("%Y-%m-%d") if u.created_at else "—"}</td></tr>' for u in users)
        management = ""
        if user.role == "owner":
            permission_inputs = "".join(f'<label class="permcheck"><input type="checkbox" name="permissions" value="{key}"> {label}</label>' for key, label in PERMISSION_LABELS.items())
            edit_forms = ""
            for helper in [x for x in users if x.role == "helper"]:
                checks = "".join(f'<label class="permcheck"><input type="checkbox" name="permissions" value="{key}" {"checked" if key in get_permissions(helper) else ""}> {label}</label>' for key, label in PERMISSION_LABELS.items())
                edit_forms += f'<div class="helper-edit"><b>{esc(helper.username)} — ruxsatlari</b><form method="post" action="/team/{helper.id}/permissions" class="permgrid">{checks}<button class="btn small full">Ruxsatlarni saqlash</button></form><form method="post" action="/team/{helper.id}/toggle"><button class="btn danger small">{"Hisobni bloklash" if helper.active else "Hisobni faollashtirish"}</button></form></div>'
            management = f'<div class="notice">Yordamchi admin faqat belgilangan ruxsatlardan foydalana oladi. U yangi admin yarata olmaydi va ruxsatlarni o‘zgartira olmaydi.</div><form class="formgrid" style="margin-top:18px" method="post" action="/team/add"><label>Yordamchi login<input name="username" required minlength="3" autocomplete="off"></label><label>Vaqtinchalik parol<input name="password" type="password" required minlength="16" autocomplete="new-password"></label><div class="full"><b>Yangi yordamchiga beriladigan ruxsatlar</b><div class="permgrid">{permission_inputs}</div></div><button class="btn full">＋ Yordamchi admin yaratish</button></form>{edit_forms or "<p class=hint>Hali yordamchi admin qo‘shilmagan.</p>"}'
        team_section = f'<section class="section" id="jamoa"><div class="sectionhead"><div><h2>Yordamchi adminlar va huquqlar</h2><p>Har bir yordamchiga alohida ruxsat belgilang.</p></div></div><div class="card"><div class="tablewrap"><table><thead><tr><th>Foydalanuvchi</th><th>Daraja</th><th>Ruxsatlar</th><th>Holat</th><th>Sana</th></tr></thead><tbody>{rows}</tbody></table></div>{management}</div></section>'
    log_html = "".join('<div class="logrow"><b>'+esc(a.action)+'</b> · '+esc(a.actor)+'<div class="muted">'+esc(a.detail)+' · '+(a.created_at.strftime("%Y-%m-%d %H:%M UTC") if a.created_at else "")+'</div></div>' for a in logs) or '<div class="empty">Hozircha hodisalar yo‘q.</div>'
    audit_section = f'<section class="section" id="jurnal"><div class="sectionhead"><div><h2>Xavfsizlik va audit jurnali</h2><p>Kim, qachon va qanday amal bajarganini ko‘ring.</p></div><a class="btn secondary small" href="/api/audit">Jurnalni yuklash</a></div><div class="card">{log_html}</div></section>' if can("audit.view") else ""
    ai_ready = bool(os.getenv("OPENAI_API_KEY"))
    ai_section = f'<section class="section" id="suniy"><div class="sectionhead"><div><h2>Sun’iy intellekt boshqaruvi</h2><p>AI xizmatlari uchun ulanish holati.</p></div></div><div class="card"><div class="projecttop"><div><b>OpenAI API</b><div class="kind">AI integratsiyasi</div></div><span class="status {" " if ai_ready else "off"}">{"KALIT SOZLANGAN" if ai_ready else "KALIT KIRITILMAGAN"}</span></div><p class="sub">AI funksiyalari uchun API kaliti Render maxfiy muhit sozlamalarida saqlanadi.</p></div></section>' if can("ai.view") else ""
    backup_actions = ('<a class="btn" href="/backup">↓ Zaxira nusxasini olish</a>' if can("backup.create") else '') + ('<button class="btn secondary" onclick="document.getElementById(\'restoremodal\').classList.add(\'open\')">↑ Zaxiradan tiklash</button>' if can("backup.restore") else '')
    backup_section = f'<section class="section" id="zaxira"><div class="sectionhead"><div><h2>Zaxira nusxa va tiklash</h2><p>Loyiha ro‘yxati va audit ma’lumotlarini JSON ko‘rinishida saqlash.</p></div></div><div class="card"><p class="sub">Zaxira nusxada parollar va maxfiy kalitlar bo‘lmaydi. Tiklash loyiha ro‘yxatini almashtiradi.</p><div class="actions">{backup_actions}</div></div></section>' if backup_actions else ""
    overview_grid = f'<div class="grid"><div class="stat"><div class="statlabel">Ro‘yxatdagi loyihalar</div><div class="statnum">{len(projects)}</div><div class="statfoot">Markazga ulangan</div></div><div class="stat"><div class="statlabel">Jamoa a’zolari</div><div class="statnum">{len(users)}</div><div class="statfoot">Boshqaruv huquqlari</div></div><div class="stat"><div class="statlabel">Audit hodisalari</div><div class="statnum">{db.query(Audit).count()}</div><div class="statfoot">Amallar tarixi</div></div><div class="stat"><div class="statlabel">Faol loyihalar</div><div class="statnum">{sum(1 for p in projects if p.active)}</div><div class="statfoot">Nazoratdagi xizmatlar</div></div></div>' if can("dashboard.view") else ""
    body = f"""
<div class="app"><aside class="side"><div class="brand"><div class="brandmark">✦</div><div><b>ITKODERS</b><small>SUPER ADMIN</small></div></div>
<div class="navcap">BOSHQARUV</div><a class="nav sel" href="#umumiy"><span>◈</span>Umumiy ko‘rinish</a><a class="nav" href="#loyihalar"><span>▦</span>Loyihalar</a><a class="nav" href="#serverlar"><span>◉</span>Server monitoring</a><a class="nav" href="#jamoa"><span>♙</span>Jamoa va huquqlar</a><div class="navcap">TIZIM</div><a class="nav" href="#jurnal"><span>⬡</span>Xavfsizlik va jurnal</a><a class="nav" href="#suniy"><span>✧</span>Sun’iy intellekt</a><a class="nav" href="#zaxira"><span>▤</span>Zaxira nusxa</a><div class="sidefoot">Himoyalangan boshqaruv markazi<br>Versiya 1.0 · O‘zbekcha</div></aside>
<main class="main"><header class="top" id="umumiy"><div><div class="eyebrow">MARKAZIY BOSHQARUV · ITKODERS</div><h1>Salom, {user.username} 👋</h1><div class="sub">Barcha loyihalaringiz holati bitta joyda.</div></div><div class="topright"><span class="who">{user.role.upper()} · Xavfsiz sessiya</span><form method="post" action="/logout"><button class="logout">Chiqish ↗</button></form></div></header>
{overview_grid}
<div class="notice">✦ <b>Yagona boshqaruv.</b> Yangi loyiha qo‘shish uchun «Loyiha ulash» tugmasidan foydalaning. Har bir loyiha alohida API orqali ulanadi.</div>
{projects_section}
{server_section}
{team_section}
{audit_section}
{ai_section}
{backup_section}
<footer class="sub" style="padding:28px 0">ITKODERS SUPER ADMIN · Barcha huquqlar himoyalangan · 1.0</footer></main></div>
<div class="modal" id="addmodal"><div class="modalbox"><div class="modalhead"><div><h2>Yangi loyihani ulash</h2><div class="sub">Ma’lumotlarni kiriting — loyiha markazga qo‘shiladi.</div></div><button class="x" onclick="closeModal('addmodal')">✕</button></div><form class="formgrid" method="post" action="/projects/add"><label>Loyiha nomi<input name="name" required placeholder="Masalan: ITKODERS WEB"></label><label>Loyiha turi<select name="kind"><option value="web">Veb-sayt</option><option value="api">API / Backend</option><option value="bot">Telegram bot</option><option value="android">Android ilova</option><option value="ai">AI loyiha</option><option value="other">Boshqa</option></select></label><label class="full">GitHub manzili<input name="repo_url" placeholder="https://github.com/itkoders/..."></label><label class="full">Sayt yoki xizmat manzili<input name="service_url" placeholder="https://loyiha.onrender.com"></label><label class="full">Render xizmat ID <input name="render_service_id" placeholder="srv-..."><div class="hint">Render'da deploy tugmasi ishlashi uchun xizmat ID va API kaliti kerak.</div></label><label class="full">Izoh<textarea name="notes" placeholder="Loyiha vazifasi yoki eslatma"></textarea></label><button class="btn full">Loyihani saqlash</button></form></div></div>
<div class="modal" id="restoremodal"><div class="modalbox"><div class="modalhead"><h2>Zaxiradan tiklash</h2><button class="x" onclick="closeModal('restoremodal')">✕</button></div><p class="sub">Bu amal mavjud loyiha ro‘yxatini tanlangan zaxira bilan almashtiradi. Avval hozirgi holatni yuklab oling.</p><form method="post" action="/restore" enctype="multipart/form-data" onsubmit="return confirm('Haqiqatan tiklaysizmi? Mavjud loyiha ro‘yxati almashtiriladi.')"><label>Zaxira JSON fayli<input type="file" name="backup" accept="application/json" required></label><button class="btn" style="margin-top:14px">Tiklashni tasdiqlash</button></form></div></div>
<script>
async function checkProject(id,btn){{let old=btn.textContent;btn.disabled=true;btn.textContent='Tekshirilmoqda…';try{{let r=await fetch('/projects/'+id+'/health');let d=await r.json();alert('Holat: '+(d.status||d.detail||'noma’lum')+(d.http_status?' · HTTP '+d.http_status:''));}}catch(e){{alert('Tekshiruv amalga oshmadi')}}finally{{btn.disabled=false;btn.textContent=old}}}}
async function importRender(){{if(!confirm("Renderdagi xizmatlarni markazga qo‘shamizmi?"))return;try{{let r=await fetch("/api/render/import",{{method:"POST"}});let d=await r.json();if(!r.ok)throw Error(d.detail||"Ulanmadi");alert(d.added+" ta yangi xizmat qo‘shildi.");location.reload();}}catch(e){{alert(e.message)}}}}
async function loadMetrics(){{try{{let r=await fetch('/api/metrics');if(!r.ok)throw Error();let d=await r.json();document.getElementById('cpu').textContent=d.cpu+'%';document.getElementById('ram').textContent=d.ram+'%';document.getElementById('disk').textContent=d.disk+'%';document.getElementById('render').textContent=d.render_api?'ULANGAN':'SOZLANMAGAN';}}catch(e){{}}}}
function closeModal(id){{document.getElementById(id).classList.remove('open')}}
loadMetrics();setInterval(loadMetrics,30000);
</script>"""
    return page_shell(APP_NAME, body, user)

def esc(value):
    import html
    return html.escape(str(value or ""))

@app.get("/health")
def health(): return {"ok": True, "service": "ITKODERS SUPER ADMIN", "version": "1.0"}

@app.get("/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(db_dep)):
    uid = request.session.get("uid")
    user = db.get(User, int(uid)) if uid else None
    if not user or not user.active: return RedirectResponse("/login", status_code=303)
    return HTMLResponse(dashboard_html(request, user, db))

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    body = """<div style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="card" style="width:min(420px,100%);padding:28px"><div class="brandmark">✦</div><div class="eyebrow" style="margin-top:20px">ITKODERS CONTROL</div><h1 style="margin:8px 0 5px">Super Admin</h1><p class="sub">Barcha loyihalaringiz uchun yagona boshqaruv.</p><form method="post" action="/login" style="margin-top:22px"><label>Login<input name="username" autocomplete="username" required></label><label style="margin-top:14px">Parol<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" style="width:100%;margin-top:20px">Tizimga kirish →</button></form><p class="hint">Kirish ma’lumotlari server egasi tomonidan beriladi.</p></div></div>"""
    return HTMLResponse(page_shell("Kirish", body))

@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...), db: Session = Depends(db_dep)):
    verify_origin(request)
    user = db.query(User).filter_by(username=username.strip()).first()
    if not user or not user.active or not verify_password(password, user.password_hash):
        body = """<div style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="card" style="width:min(420px,100%)"><h2>Kirish amalga oshmadi</h2><p class="sub">Login yoki parol noto‘g‘ri. Qayta urinib ko‘ring.</p><a class="btn" href="/login">Qayta kirish</a></div></div>"""
        return HTMLResponse(page_shell("Kirish", body), status_code=401)
    request.session.clear()
    request.session["uid"] = user.id
    request.session["issued"] = int(time.time())
    audit(db, user.username, "tizimga_kirdi", "Boshqaruv paneliga kirildi", request)
    return RedirectResponse("/", status_code=303)

@app.post("/logout")
def logout(request: Request, db: Session = Depends(db_dep)):
    verify_origin(request)
    uid = request.session.get("uid")
    user = db.get(User, int(uid)) if uid else None
    if user: audit(db, user.username, "tizimdan_chiqdi", "Sessiya yakunlandi", request)
    request.session.clear()
    return RedirectResponse("/login", status_code=303)

@app.post("/projects/add")
def add_project(request: Request, name: str = Form(...), kind: str = Form("web"), repo_url: str = Form(""),
                service_url: str = Form(""), render_service_id: str = Form(""), notes: str = Form(""),
                user: User = Depends(permission_dep("projects.manage")), db: Session = Depends(db_dep)):
    verify_origin(request)
    if not name.strip(): raise HTTPException(400, "Loyiha nomi kiritilsin")
    for url in (repo_url, service_url):
        if url and urlparse(url).scheme not in ("http", "https"): raise HTTPException(400, "Manzil http yoki https bilan boshlanishi kerak")
    p = Project(name=name.strip(), kind=kind, repo_url=repo_url.strip(), service_url=service_url.strip(),
                render_service_id=render_service_id.strip(), notes=notes.strip())
    db.add(p); db.commit()
    audit(db, user.username, "loyiha_qoshildi", p.name, request)
    return RedirectResponse("/#loyihalar", status_code=303)

@app.post("/projects/{pid}/toggle")
def toggle_project(pid: int, request: Request, user: User = Depends(permission_dep("projects.manage")), db: Session = Depends(db_dep)):
    verify_origin(request)
    p = db.get(Project, pid)
    if not p: raise HTTPException(404, "Loyiha topilmadi")
    p.active = not p.active; db.commit()
    audit(db, user.username, "loyiha_holati", f"{p.name}: {p.active}", request)
    return RedirectResponse("/#loyihalar", status_code=303)

@app.get("/projects/{pid}/health")
async def project_health(pid: int, user: User = Depends(permission_dep("projects.view")), db: Session = Depends(db_dep)):
    p = db.get(Project, pid)
    if not p: raise HTTPException(404, "Loyiha topilmadi")
    if not p.service_url: return {"status": "manzil_kiritilmagan"}
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            r = await client.get(p.service_url.rstrip("/") + "/health")
            if r.status_code == 404: r = await client.get(p.service_url)
        return {"status": "ishlayapti" if r.is_success else "ogohlantirish", "http_status": r.status_code}
    except Exception: return {"status": "javob_yoq"}

@app.post("/projects/{pid}/deploy")
async def deploy(pid: int, request: Request, user: User = Depends(permission_dep("projects.deploy")), db: Session = Depends(db_dep)):
    verify_origin(request)
    p = db.get(Project, pid)
    if not p: raise HTTPException(404, "Loyiha topilmadi")
    key = os.getenv("RENDER_API_KEY", "")
    if not key or not p.render_service_id: raise HTTPException(400, "Render API kaliti yoki xizmat ID sozlanmagan")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"https://api.render.com/v1/services/{p.render_service_id}/deploys",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"clearCache": "do_not_clear"})
    if r.status_code >= 300: raise HTTPException(502, "Render deploy so‘rovini qabul qilmadi")
    audit(db, user.username, "deploy_boshlandi", p.name, request)
    return RedirectResponse("/#loyihalar", status_code=303)

@app.post("/team/add")
def team_add(request: Request, username: str = Form(...), password: str = Form(...),
             permissions: list[str] = Form([]), user: User = Depends(role_dep("owner")), db: Session = Depends(db_dep)):
    verify_origin(request)
    username = username.strip()
    if len(username) < 3 or len(username) > 80: raise HTTPException(400, "Login 3–80 belgidan iborat bo‘lsin")
    if len(password) < 16: raise HTTPException(400, "Parol kamida 16 belgidan iborat bo‘lsin")
    if db.query(User).filter_by(username=username).first(): raise HTTPException(409, "Bu login band")
    allowed = sorted({p for p in permissions if p in PERMISSION_LABELS})
    db.add(User(username=username, password_hash=hash_password(password), role="helper",
                permissions=json.dumps(allowed, ensure_ascii=False)))
    db.commit(); audit(db, user.username, "yordamchi_admin_qoshildi", f"{username}: {', '.join(allowed) or 'ruxsat berilmadi'}", request)
    return RedirectResponse("/#jamoa", status_code=303)

@app.post("/team/{uid}/permissions")
def team_permissions(uid: int, request: Request, permissions: list[str] = Form([]),
                     user: User = Depends(role_dep("owner")), db: Session = Depends(db_dep)):
    verify_origin(request)
    target = db.get(User, uid)
    if not target or target.role != "helper": raise HTTPException(404, "Yordamchi admin topilmadi")
    allowed = sorted({p for p in permissions if p in PERMISSION_LABELS})
    target.permissions = json.dumps(allowed, ensure_ascii=False)
    db.commit(); audit(db, user.username, "yordamchi_ruxsatlari_yangilandi", f"{target.username}: {', '.join(allowed) or 'ruxsat yo‘q'}", request)
    return RedirectResponse("/#jamoa", status_code=303)

@app.post("/team/{uid}/toggle")
def team_toggle(uid: int, request: Request, user: User = Depends(role_dep("owner")), db: Session = Depends(db_dep)):
    verify_origin(request)
    target = db.get(User, uid)
    if not target or target.role != "helper" or target.id == user.id:
        raise HTTPException(404, "Yordamchi admin topilmadi")
    target.active = not target.active
    db.commit(); audit(db, user.username, "yordamchi_hisobi_holati", f"{target.username}: {'faol' if target.active else 'bloklandi'}", request)
    return RedirectResponse("/#jamoa", status_code=303)

@app.post("/api/render/import")
async def import_render(request: Request, user: User = Depends(permission_dep("projects.import")), db: Session = Depends(db_dep)):
    verify_origin(request)
    key = os.getenv("RENDER_API_KEY", "")
    if not key: raise HTTPException(400, "Render API kaliti sozlanmagan")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get("https://api.render.com/v1/services?limit=100",
            headers={"Authorization": f"Bearer {key}"})
    if r.status_code >= 300: raise HTTPException(502, "Render xizmatlari ro‘yxatini olish imkonsiz")
    payload = r.json()
    added = 0
    items = payload if isinstance(payload, list) else payload.get("items", [])
    for item in items:
        svc = item.get("service", item) if isinstance(item, dict) else {}
        sid = str(svc.get("id", ""))
        if not sid or db.query(Project).filter_by(render_service_id=sid).first(): continue
        details = svc.get("serviceDetails") or {}
        name = str(svc.get("name") or "Render xizmati")
        url = str(details.get("url") or svc.get("url") or "")
        repo = str(svc.get("repo") or "")
        kind = str(svc.get("type") or "web").lower()
        db.add(Project(name=name, kind=kind[:40], repo_url=repo[:500], service_url=url[:500], render_service_id=sid))
        added += 1
    db.commit()
    audit(db, user.username, "render_xizmatlari_import", f"{added} ta xizmat qo‘shildi", request)
    return {"ok": True, "added": added}

@app.get("/api/metrics")
def metrics(user: User = Depends(permission_dep("servers.view"))):
    try: disk = psutil.disk_usage("/").percent
    except Exception: disk = 0
    return {"cpu": psutil.cpu_percent(interval=0.1), "ram": psutil.virtual_memory().percent,
            "disk": disk, "render_api": bool(os.getenv("RENDER_API_KEY"))}

@app.get("/api/audit")
def audit_export(user: User = Depends(permission_dep("audit.view")), db: Session = Depends(db_dep)):
    rows = db.query(Audit).order_by(Audit.created_at.desc()).limit(1000).all()
    return [{"vaqt": x.created_at.isoformat() if x.created_at else "", "foydalanuvchi": x.actor,
             "amal": x.action, "tafsilot": x.detail, "ip": x.ip} for x in rows]

@app.get("/backup")
def backup(user: User = Depends(permission_dep("backup.create")), db: Session = Depends(db_dep)):
    data = {"format": "itkoders-super-admin-backup-v1", "created_at": datetime.now(timezone.utc).isoformat(),
            "projects": [{"name":p.name,"kind":p.kind,"repo_url":p.repo_url,"service_url":p.service_url,
                          "render_service_id":p.render_service_id,"notes":p.notes,"active":p.active} for p in db.query(Project).all()],
            "audit": [{"actor":a.actor,"action":a.action,"detail":a.detail,"ip":a.ip,
                       "created_at":a.created_at.isoformat() if a.created_at else ""} for a in db.query(Audit).order_by(Audit.created_at.desc()).limit(1000).all()]}
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    return StreamingResponse(iter([payload]), media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=itkoders-super-admin-backup.json"})

@app.post("/restore")
async def restore(request: Request, backup: UploadFile = File(...), user: User = Depends(permission_dep("backup.restore")), db: Session = Depends(db_dep)):
    verify_origin(request)
    if backup.content_type not in ("application/json", "application/octet-stream", "text/json"):
        raise HTTPException(400, "JSON zaxira faylini tanlang")
    raw = await backup.read(2_000_000)
    try: data = json.loads(raw)
    except Exception: raise HTTPException(400, "Zaxira fayli noto‘g‘ri")
    if data.get("format") != "itkoders-super-admin-backup-v1" or not isinstance(data.get("projects"), list):
        raise HTTPException(400, "Zaxira formati mos emas")
    db.query(Project).delete()
    for p in data["projects"]:
        db.add(Project(name=str(p.get("name",""))[:140], kind=str(p.get("kind","web"))[:40],
            repo_url=str(p.get("repo_url",""))[:500], service_url=str(p.get("service_url",""))[:500],
            render_service_id=str(p.get("render_service_id",""))[:120], notes=str(p.get("notes","")),
            active=bool(p.get("active",True))))
    db.commit(); audit(db, user.username, "zaxiradan_tiklandi", f"{len(data['projects'])} loyiha tiklandi", request)
    return RedirectResponse("/#zaxira", status_code=303)

@app.exception_handler(401)
async def unauthorized(request: Request, exc: HTTPException):
    return RedirectResponse("/login", status_code=303)

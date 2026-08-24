"""Comunicados oficiales — historial de anuncios de la plataforma."""
import re
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from config import db
from services.auth import get_current_user, get_admin_user
from services.email import get_email_template

router = APIRouter()

SEED_COMMUNICATIONS = [
    {
        'id': str(uuid.uuid4()),
        'slug': 'nueva-administracion-2026',
        'title': 'Nueva administración PayLionsbit',
        'published_at': '2026-02-03',
        'signature': 'PayLionsbit — Nueva Administración',
        'body': [
            'Desde el 03/02/2026, PayLionsbit se encuentra bajo una nueva administración, enfocada en revisar, organizar y dar continuidad a procesos que habían quedado pendientes dentro de la plataforma.',
            'Entendemos que algunos usuarios han atravesado situaciones difíciles o prolongadas anteriormente, y lamentamos sinceramente cualquier inconveniente relacionado con esas etapas previas.',
            'Esta nueva administración tiene como objetivo acompañar a cada usuario hasta completar correctamente su proceso, brindando información clara, seguimiento y asistencia durante cada etapa de la operación.',
            'Nuestro equipo de agentes está disponible para ofrecerle el mejor servicio posible, orientarle ante cualquier duda y ayudarle a gestionar correctamente los procedimientos reflejados dentro de su cuenta.',
            'Los importes, cargos o comisiones que correspondan a una operación serán mostrados directamente dentro de la plataforma, junto con la información aplicable al proceso. Recomendamos revisar siempre estos datos antes de confirmar cualquier operación.',
            'Nuestro compromiso es trabajar de manera organizada y transparente para que los usuarios puedan completar sus procesos pendientes y acceder a los fondos o cantidades que correspondan conforme al estado real de su cuenta y a las condiciones aplicables.',
        ],
    },
]


async def _ensure_seed():
    for comm in SEED_COMMUNICATIONS:
        await db.official_communications.update_one(
            {'slug': comm['slug']},
            {'$setOnInsert': comm},
            upsert=True,
        )


@router.get("/communications")
async def list_communications(current_user: dict = Depends(get_current_user)):
    await _ensure_seed()
    comms = await db.official_communications.find({}, {'_id': 0}).sort('published_at', -1).to_list(100)
    return {'communications': comms, 'count': len(comms)}


class CommunicationCreate(BaseModel):
    title: str
    body: str
    send_email: bool = True


def _slugify(title: str) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:60] or 'comunicado'
    return f"{base}-{uuid.uuid4().hex[:6]}"


def _build_email_html(title: str, paragraphs: list, date_str: str) -> str:
    paras = ''.join(
        f'<p style="color: #cbd5e1; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">{p}</p>'
        for p in paragraphs
    )
    content = f"""
        <h2 style="color: white; margin: 0 0 6px 0; font-size: 20px;">{title}</h2>
        <p style="color: #F0B90B; font-size: 12px; margin: 0 0 24px 0;">Comunicado oficial · {date_str}</p>
        {paras}
        <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0 0;">
            Puede releer todos los comunicados oficiales desde la sección
            <strong style="color: #F0B90B;">Comunicados Oficiales</strong> dentro de la plataforma.
        </p>
    """
    return get_email_template(content, title="LIONSBIT VERIFICACION")


@router.post("/admin/communications")
async def create_communication(payload: CommunicationCreate, admin: dict = Depends(get_admin_user)):
    title = payload.title.strip()
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n|\n', payload.body) if p.strip()]
    if not title or not paragraphs:
        raise HTTPException(status_code=400, detail='Título y contenido son obligatorios')

    now = datetime.now(timezone.utc)
    comm = {
        'id': str(uuid.uuid4()),
        'slug': _slugify(title),
        'title': title,
        'published_at': now.strftime('%Y-%m-%d'),
        'signature': 'PayLionsbit — Nueva Administración',
        'body': paragraphs,
        'created_by': admin.get('email'),
        'created_at': now.isoformat(),
    }
    await db.official_communications.insert_one({**comm})

    queued = 0
    if payload.send_email:
        date_str = now.strftime('%d/%m/%Y')
        html = _build_email_html(title, paragraphs, date_str)
        subject = f"Comunicado oficial: {title}"
        users = await db.users.find(
            {'is_demo': {'$ne': True}, 'email': {'$not': re.compile(r'@test\.com$', re.I)}},
            {'_id': 0, 'email': 1},
        ).to_list(5000)
        docs = [{
            'id': str(uuid.uuid4()),
            'to_email': u['email'],
            'subject': subject,
            'html': html,
            'status': 'queued',
            'priority': 2,
            'attempts': 0,
            'last_error': None,
            'created_at': now.isoformat(),
            'last_attempt_at': None,
            'sent_at': None,
            'source': f"communication:{comm['slug']}",
        } for u in users if u.get('email')]
        if docs:
            await db.email_queue.insert_many(docs)
            queued = len(docs)
        logging.info(f"Comunicado '{title}' publicado · {queued} emails encolados (p2)")

    return {'communication': comm, 'queued_emails': queued}

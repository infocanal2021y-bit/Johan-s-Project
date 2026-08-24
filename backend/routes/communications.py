"""Comunicados oficiales — historial de anuncios de la plataforma."""
import uuid
from fastapi import APIRouter, Depends
from config import db
from services.auth import get_current_user

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

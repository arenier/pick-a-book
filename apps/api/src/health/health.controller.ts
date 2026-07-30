import { Controller, Get } from '@nestjs/common';

/**
 * Point de sante consomme par Cloud Run (ADR 0004) et par le healthcheck du docker-compose.
 *
 * Deliberement pauvre : il dit que le processus repond, rien de plus. Y brancher une
 * verification du bucket ou de la base rendrait le demarrage a froid — assume par le
 * scale-to-zero — plus lent et plus fragile.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}

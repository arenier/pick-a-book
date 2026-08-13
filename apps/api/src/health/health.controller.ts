import { Controller, Get } from '@nestjs/common';

/**
 * Health endpoint consumed by Cloud Run (ADR 0004) and by the docker-compose healthcheck.
 *
 * Deliberately thin: it says the process answers, nothing more. Wiring a bucket or database
 * check into it would make the cold start — accepted as part of scale-to-zero — slower and
 * more brittle.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}

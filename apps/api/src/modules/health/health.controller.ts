import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../../common/decorators/access.decorators.js';
import { DatabaseHealthIndicator } from './database.health.js';

@ApiTags('Health')
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /** Liveness: the process is up. No dependency checks. */
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /** Readiness: the API can serve traffic (database reachable). */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.pingCheck()]);
  }
}

import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

/**
 * PostgreSQL readiness check.
 * Terminus' built-in PrismaHealthIndicator first tries a MongoDB `ping` command, which hangs
 * with Prisma 7 + the pg driver adapter, so we issue `SELECT 1` directly.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  pingCheck(key = 'database') {
    return this.healthIndicator
      .check(key)
      .attempt(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      })
      .withTimeout('1500ms');
  }
}

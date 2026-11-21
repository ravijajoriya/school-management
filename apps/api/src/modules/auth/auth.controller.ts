import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  loginSchema,
  type AuthResponse,
  type ChangePasswordInput,
  type LoginInput,
} from '@school/shared';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.schema.js';
import {
  AllowPendingPasswordChange,
  Authenticated,
  CurrentUser,
  Public,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AuthService, type SessionResult } from './auth.service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './refresh-cookie.js';
import { RefreshTokenRaceError } from './token.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly apiPrefix: string;
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.apiPrefix = config.get('API_PREFIX', { infer: true });
    this.cookieSecure = config.get('COOKIE_SECURE', { infer: true });
  }

  /** Sign in with email or phone + password. Sets the refresh-token cookie. */
  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(body, getRequestContext(req)));
  }

  /** Exchanges the refresh-token cookie for a new access token (and rotates the cookie). */
  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      const result = await this.auth.refresh(
        req.cookies?.[REFRESH_COOKIE] as string | undefined,
        getRequestContext(req),
      );
      return this.respond(res, result);
    } catch (error) {
      // Keep the cookie when another tab just rotated it; clear it in every other failure case.
      if (!(error instanceof RefreshTokenRaceError)) {
        res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.apiPrefix, this.cookieSecure));
      }
      throw error;
    }
  }

  /** Ends the current session and clears the cookie. Always succeeds. */
  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(
      req.cookies?.[REFRESH_COOKIE] as string | undefined,
      getRequestContext(req),
    );
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.apiPrefix, this.cookieSecure));
  }

  /** The signed-in user with roles and effective permissions. */
  @Get('me')
  @Authenticated()
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  /** Changes the signed-in user's password; returns a fresh session. */
  @Post('change-password')
  @Authenticated()
  @AllowPendingPasswordChange()
  @HttpCode(200)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.changePassword(user.id, body, getRequestContext(req)));
  }

  private respond(res: Response, result: SessionResult): AuthResponse {
    res.cookie(
      REFRESH_COOKIE,
      result.refreshToken.token,
      refreshCookieOptions(this.apiPrefix, this.cookieSecure, result.refreshToken.expiresAt),
    );
    res.setHeader('Cache-Control', 'no-store');
    return result.response;
  }
}

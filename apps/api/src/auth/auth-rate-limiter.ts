import { HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class AuthRateLimiter {
  private readonly counters = new Map<string, { count: number; expires: number }>();
  check(ip: string, username: string) {
    const now = Date.now();
    for (const [key, value] of this.counters) if (value.expires <= now) this.counters.delete(key);
    const keys = [`ip:${ip}`, `username:${username}`];
    if (this.counters.size > 10000 && keys.some(key => !this.counters.has(key))) {
      throw new HttpException({ code: 'AUTH_RATE_LIMITED', message: 'Try signing in again later.' }, 429);
    }
    for (const [index, key] of keys.entries()) {
      const value = this.counters.get(key) ?? { count: 0, expires: now + 15 * 60 * 1000 };
      value.count++;
      this.counters.set(key, value);
      if (value.count > (index === 0 ? 60 : 20)) throw new HttpException({ code: 'AUTH_RATE_LIMITED', message: 'Try signing in again later.' }, 429);
    }
  }
}

// ==========================================
// particles.js - 雪花与天气粒子系统
// ==========================================

export class SnowParticle {
  constructor(w, h) {
    this.reset(w, h, true);
  }

  reset(w, h, randomY) {
    this.x = Math.random() * w;
    this.y = randomY ? Math.random() * h : -5;
    this.size = 1 + Math.random() * 3;
    this.speedY = 0.5 + Math.random() * 1.5;
    this.speedX = -0.3 + Math.random() * 0.6;
    this.opacity = 0.3 + Math.random() * 0.7;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = 0.01 + Math.random() * 0.02;
  }
}

export class ParticleSystem {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.snowflakes = [];
    this.blizzardParticles = [];
    this.maxSnow = 80;
    this.maxBlizzard = 150;

    // 初始化雪花
    for (let i = 0; i < this.maxSnow; i++) {
      this.snowflakes.push(new SnowParticle(this.w, this.h));
    }
  }

  update(weather) {
    const isBlizzard = weather.blizzardState === 'BLZ_ACTIVE';
    const isSnowy = weather.currentWeather === 'WTH_SNOW' || isBlizzard;

    // 更新普通雪花
    for (const s of this.snowflakes) {
      s.wobble += s.wobbleSpeed;
      s.x += s.speedX + Math.sin(s.wobble) * 0.3;
      s.y += s.speedY;

      if (s.y > this.h || s.x < -10 || s.x > this.w + 10) {
        s.reset(this.w, this.h, false);
      }
    }

    // 暴风雪粒子
    if (isBlizzard) {
      while (this.blizzardParticles.length < this.maxBlizzard) {
        const p = {
          x: this.w + Math.random() * 50,
          y: Math.random() * this.h,
          speedX: -(4 + Math.random() * 6),
          speedY: -1 + Math.random() * 2,
          size: 1 + Math.random() * 2,
          opacity: 0.2 + Math.random() * 0.4,
          life: 1,
        };
        this.blizzardParticles.push(p);
      }
      for (let i = this.blizzardParticles.length - 1; i >= 0; i--) {
        const p = this.blizzardParticles[i];
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < -10 || p.y < -10 || p.y > this.h + 10) {
          this.blizzardParticles.splice(i, 1);
        }
      }
    } else {
      this.blizzardParticles.length = 0;
    }
  }

  draw(ctx, weather) {
    const isSnowy = weather.currentWeather === 'WTH_SNOW' || weather.blizzardState === 'BLZ_ACTIVE';

    // 普通雪花
    if (isSnowy) {
      ctx.save();
      for (const s of this.snowflakes) {
        ctx.globalAlpha = s.opacity;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 暴风雪粒子
    if (this.blizzardParticles.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      for (const p of this.blizzardParticles) {
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.speedX * 2, p.y + p.speedY * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

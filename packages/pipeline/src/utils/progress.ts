const BAR_WIDTH = 24;

export class ProgressBar {
  private current = 0;
  private readonly startedAt = Date.now();
  private readonly isTTY: boolean;

  constructor(
    private readonly label: string,
    private readonly total: number,
  ) {
    this.isTTY = Boolean(process.stdout.isTTY);
    this.render();
  }

  tick(suffix = ""): void {
    this.current = Math.min(this.current + 1, this.total);
    this.render(suffix);
  }

  done(suffix = ""): void {
    this.current = this.total;
    this.render(suffix);
    process.stdout.write("\n");
  }

  private render(suffix = ""): void {
    const pct = this.total === 0 ? 1 : this.current / this.total;
    const filled = Math.round(pct * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    const line = `[${this.label}] ${bar} ${this.current}/${this.total} (${(pct * 100).toFixed(0)}%) ${elapsed}s${suffix ? ` — ${suffix}` : ""}`;

    if (this.isTTY) {
      process.stdout.write(`\r${line}\x1b[K`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}

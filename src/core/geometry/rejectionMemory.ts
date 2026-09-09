/**
 * @license
 * AUME LowPoly Fabrication — Rejection Memory
 * Specification Compliant: Sections 14, 18, 75, 83
 */

export class RejectionMemory {
  private rejectedPairs = new Set<string>();

  public static makeKey(faceKey: string, regionKey: string): string {
    return `${faceKey}|${regionKey}`;
  }

  public hasRejected(faceKey: string, regionKey: string): boolean {
    return this.rejectedPairs.has(RejectionMemory.makeKey(faceKey, regionKey));
  }

  public rememberRejected(faceKey: string, regionKey: string): void {
    this.rejectedPairs.add(RejectionMemory.makeKey(faceKey, regionKey));
  }

  public clear(): void {
    this.rejectedPairs.clear();
  }

  public size(): number {
    return this.rejectedPairs.size;
  }
}

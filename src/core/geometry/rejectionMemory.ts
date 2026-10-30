/**
 * @license
 * AUME LowPoly Fabrication — Rejection Memory
 * Specification Compliant: Sections 14, 18, 75, 83
 */

export class RejectionMemory {
  // Key format: `${faceKey}|${regionKey}|${regionVersion}`
  private rejectedPairs = new Map<string, string>();

  public static makeKey(faceKey: string, regionKey: string, regionVersion: number = 0): string {
    return `${faceKey}|${regionKey}|v${regionVersion}`;
  }

  public hasRejected(faceKey: string, regionKey: string, regionVersion: number = 0): boolean {
    return this.rejectedPairs.has(RejectionMemory.makeKey(faceKey, regionKey, regionVersion));
  }

  public rememberRejected(
    faceKey: string,
    regionKey: string,
    regionVersion: number = 0,
    reason: string = 'UNKNOWN'
  ): void {
    this.rejectedPairs.set(
      RejectionMemory.makeKey(faceKey, regionKey, regionVersion),
      reason
    );
  }

  public getRejectionReason(
    faceKey: string,
    regionKey: string,
    regionVersion: number = 0
  ): string | undefined {
    return this.rejectedPairs.get(RejectionMemory.makeKey(faceKey, regionKey, regionVersion));
  }

  public clear(): void {
    this.rejectedPairs.clear();
  }

  public size(): number {
    return this.rejectedPairs.size;
  }
}

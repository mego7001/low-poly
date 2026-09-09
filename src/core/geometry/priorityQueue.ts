/**
 * @license
 * AUME LowPoly Fabrication — Deterministic Priority Queue
 * Specification Compliant: Sections 10, 12, 13, 22
 */

import { RegionCandidate } from './types';

/**
 * Deterministic candidate comparison:
 * 1. Score descending (higher score is better)
 * 2. Face stable key ascending (lexicographical tie-break)
 * 3. Region stable key ascending
 */
export function compareCandidates(a: RegionCandidate, b: RegionCandidate): number {
  if (Math.abs(a.score - b.score) > 1e-7) {
    return b.score - a.score; // Descending
  }
  const faceComp = a.faceKey.localeCompare(b.faceKey);
  if (faceComp !== 0) {
    return faceComp; // Ascending
  }
  return a.regionKey.localeCompare(b.regionKey); // Ascending
}

export class CandidatePriorityQueue {
  private heap: RegionCandidate[] = [];

  public push(candidate: RegionCandidate): void {
    this.heap.push(candidate);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): RegionCandidate | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  public peek(): RegionCandidate | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  public clear(): void {
    this.heap = [];
  }

  public size(): number {
    return this.heap.length;
  }

  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(index: number): void {
    const item = this.heap[index];
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIdx];
      // If item has higher priority than parent, swap
      if (compareCandidates(item, parent) < 0) {
        this.heap[index] = parent;
        this.heap[parentIdx] = item;
        index = parentIdx;
      } else {
        break;
      }
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    const item = this.heap[index];

    while (true) {
      const leftChildIdx = 2 * index + 1;
      const rightChildIdx = 2 * index + 2;
      let swapIdx: number | null = null;

      if (leftChildIdx < length) {
        const leftChild = this.heap[leftChildIdx];
        if (compareCandidates(leftChild, item) < 0) {
          swapIdx = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        const rightChild = this.heap[rightChildIdx];
        const compareTarget = swapIdx === null ? item : this.heap[leftChildIdx];
        if (compareCandidates(rightChild, compareTarget) < 0) {
          swapIdx = rightChildIdx;
        }
      }

      if (swapIdx === null) break;

      this.heap[index] = this.heap[swapIdx];
      this.heap[swapIdx] = item;
      index = swapIdx;
    }
  }
}

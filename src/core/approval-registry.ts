export class ApprovalRegistry {
  private static approvedElements = new WeakSet<HTMLElement>();

  public static approve(element: HTMLElement): void {
    this.approvedElements.add(element);
  }

  public static isApproved(element: HTMLElement): boolean {
    return this.approvedElements.has(element);
  }

  public static revoke(element: HTMLElement): void {
    this.approvedElements.delete(element);
  }
}

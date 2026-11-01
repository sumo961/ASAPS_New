/**
 * The ids of the nodes the flowchart currently holds — every beat, cluster
 * and dialog node it knows, drawn or not. The flowchart draws only what is
 * in view (onlyRenderVisibleElements), so the page's elements no longer say
 * which beats it has; checks that ask (AIDebugService) read this instead.
 * null while no flowchart is mounted.
 */
let ids: ReadonlySet<string> | null = null;

export function setGraphNodeIds(next: ReadonlySet<string> | null): void {
  ids = next;
}

export function getGraphNodeIds(): ReadonlySet<string> | null {
  return ids;
}

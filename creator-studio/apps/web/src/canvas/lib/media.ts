/** 媒体节点辅助：从 ArtifactVersion.contentRef(asset) 取 assetId，并构造受保护的内容 URL。 */

export interface AssetRefVersion {
  contentRef?: { type: string; id?: string } | null
}

export function versionAssetId(version: AssetRefVersion | null | undefined): string | null {
  const ref = version?.contentRef
  return ref?.type === 'asset' && ref.id ? ref.id : null
}

export function assetContentUrl(assetId: string): string {
  return `/api/v1/assets/${encodeURIComponent(assetId)}/content`
}

import type { ArtifactDetail, ArtifactVersion, CollectionItem } from '@creator-studio/contracts'
import type { NodeProps } from '@xyflow/react'
import { Check } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import { artifactApi } from '../api/artifact-api'
import { useArtifactStore } from '../artifacts/artifact-store'
import { assetContentUrl, versionAssetId } from '../lib/media'
import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'
import { cardStatus, displayTitle, nodeIconElement, nodeTone, roleLabelKey } from './node-role'
import { useNodeRun } from './use-node-run'

const LABELS = ['A', 'B', 'C', 'D'] as const

function CandidateThumb({ artifact, version, label, selected, onSelect }: { artifact: ArtifactDetail | undefined; version: ArtifactVersion | undefined; label: string; selected: boolean; onSelect: () => void }) {
  const assetId = versionAssetId(artifact?.currentVersion ?? version)
  return (
    <Button
      className={`relative h-auto min-h-0 overflow-hidden rounded-md border p-0 text-left ${selected ? 'border-primary ring-1 ring-primary/40' : 'border-border/70'}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      variant="ghost"
    >
      {assetId ? <img alt="" className="h-24 w-full object-cover" loading="lazy" src={assetContentUrl(assetId)} /> : <div className="h-24 bg-surface/70" />}
      <span className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">{label}</span>
      {selected ? <Check aria-hidden="true" className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" /> : null}
    </Button>
  )
}

export function CollectionNode(props: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const lod = useLod()
  const { data, id, selected } = props
  const role = data.role || 'collection'
  const icon = nodeIconElement(role, data.kind)
  const run = useNodeRun(data.artifactId)
  const items = useArtifactStore((state) => (data.artifactId ? state.collectionItems[data.artifactId] : undefined))
  const versions = useArtifactStore((state) => (data.artifactId ? state.versions[data.artifactId] : undefined))
  const byId = useArtifactStore((state) => state.byId)

  useEffect(() => {
    if (!data.artifactId) return
    void useArtifactStore.getState().getCollectionItems(data.artifactId).catch(() => {
      void useArtifactStore.getState().getVersions(data.artifactId).catch(() => undefined)
    })
  }, [data.artifactId])

  useEffect(() => {
    if (!items?.length) return
    const store = useArtifactStore.getState()
    for (const item of items.slice(0, 4)) {
      if (!store.byId[item.itemArtifactId]) void store.getArtifact(item.itemArtifactId).catch(() => undefined)
    }
  }, [items])

  const fallback = t(roleLabelKey(role), { defaultValue: role })
  const candidates = items?.length
    ? items.slice(0, 4).map((item) => ({ key: item.itemArtifactId, artifact: byId[item.itemArtifactId], selected: item.selected, item, version: undefined as ArtifactVersion | undefined }))
    : (versions ?? []).slice(0, 4).map((version) => ({ key: version.id, version, selected: version.id === data.artifact?.currentVersionId, artifact: undefined as ArtifactDetail | undefined, item: undefined as CollectionItem | undefined }))

  const select = (candidate: (typeof candidates)[number]) => {
    if (!data.artifactId) return
    if (candidate.item) {
      void useArtifactStore.getState().selectCollectionItem(data.artifactId, candidate.item.itemArtifactId).catch(() => undefined)
      return
    }
    if (candidate.version) {
      void artifactApi.restore(data.artifactId, candidate.version.id).then(() => {
        useArtifactStore.getState().invalidate(data.artifactId)
      }).catch(() => undefined)
    }
  }

  return (
    <NodeFrame icon={icon}
      artifactId={data.artifactId}
      lod={lod} nodeId={id} selected={selected} status={cardStatus(data.artifact, run)} title={displayTitle(data.artifact, role, fallback)} tone={nodeTone(role, data.kind)} widthClass="w-[440px]">
      <div className="nodrag grid grid-cols-4 gap-1.5 px-3 pb-1">
        {LABELS.map((label, index) => {
          const candidate = candidates[index]
          if (!candidate) {
            // 生成中（占位 collection 尚无候选）：空槽呼吸提示 loading。
            return <div className={cardStatus(data.artifact, run) === 'running' ? 'h-24 animate-pulse rounded-md border border-dashed border-border/60 bg-surface/40' : 'h-24 rounded-md border border-dashed border-border/60 bg-surface/40'} key={label} />
          }
          return <CandidateThumb artifact={candidate.artifact} key={candidate.key} label={t('canvas.candidateLabel', { label })} onSelect={() => select(candidate)} selected={candidate.selected} version={candidate.version} />
        })}
      </div>
    </NodeFrame>
  )
}

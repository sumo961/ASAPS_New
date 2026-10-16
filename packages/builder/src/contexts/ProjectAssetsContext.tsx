/**
 * The project's assets, for pickers nested deep inside editors (an inventory
 * effect inside a dialog choice inside the Inspector) that would otherwise
 * need assets and upload handlers threaded through every host.
 */
import React, { createContext, useContext, useMemo } from 'react';
import type { Asset } from '../components/assets/AssetManager';

interface ProjectAssetsContextValue {
  assets: Asset[];
  /** Adds an uploaded asset to the project; absent outside the app (tests). */
  onAssetAdd?: (asset: Asset) => Promise<boolean>;
}

const ProjectAssetsContext = createContext<ProjectAssetsContextValue>({ assets: [] });

export const ProjectAssetsProvider: React.FC<{
  assets: Asset[];
  onAssetAdd?: (asset: Asset) => Promise<boolean>;
  children: React.ReactNode;
}> = ({ assets, onAssetAdd, children }) => {
  const value = useMemo(() => ({ assets, onAssetAdd }), [assets, onAssetAdd]);
  return <ProjectAssetsContext.Provider value={value}>{children}</ProjectAssetsContext.Provider>;
};

export function useProjectAssets(): ProjectAssetsContextValue {
  return useContext(ProjectAssetsContext);
}

import { Beat } from '../beats/Beat';
import type { Cluster, ContainerBeatPosition } from '../types'; // Import cluster types
import type { StoryMetadata } from '../types';

export class Story {
  private beats: Map<string, Beat> = new Map();
  private metadata: StoryMetadata;
  private settings: any = {};
  private environment: { props: any[], nodes: any[] } = { props: [], nodes: [] };
  private characters: any[] = [];
  private clusters: Cluster[] = [];
  private containerBeatPositions: ContainerBeatPosition[] = [];
  private assets: any[] = [];

  constructor(metadata?: Partial<StoryMetadata>) {
    this.metadata = {
      firstBeatId: '0',
      title: 'Untitled Story',
      ...metadata
    };
  }

  addBeat(beat: Beat): void {
    this.beats.set(beat.id, beat);
  }

  getBeat(id: string): Beat | undefined {
    return this.beats.get(id);
  }

  getFirstBeatId(): string {
    // If explicitly set and exists, use it
    if (this.metadata.firstBeatId && this.beats.has(this.metadata.firstBeatId)) {
      return this.metadata.firstBeatId;
    }
    // Auto-detect: prefer titleScreen beats
    for (const [id, beat] of this.beats) {
      if (beat.type === 'titleScreen') return id;
    }
    // Fallback: first beat in the map
    const first = this.beats.keys().next().value;
    return first || '0';
  }

  setFirstBeatId(id: string): void {
    this.metadata.firstBeatId = id;
  }

  setMetadata(metadata: Partial<StoryMetadata>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  getMetadata(): StoryMetadata {
    return this.metadata;
  }

  addEnvironmentItem(type: 'prop' | 'node', item: any): void {
    if (type === 'prop') {
      this.environment.props.push(item);
    } else if (type === 'node') {
      this.environment.nodes.push(item);
    }
  }

  addCharacter(character: any): void {
    this.characters.push(character);
  }

  getAllBeats(): Beat[] {
    return Array.from(this.beats.values());
  }

  setSettings(settings: any): void {
    this.settings = settings;
  }

  getSettings(): any {
    return this.settings;
  }

  setEnvironment(environment: any): void {
    this.environment = environment;
  }

  getEnvironment(): any {
    return this.environment;
  }

  setCharacters(characters: any[]): void {
    this.characters = characters;
  }

  getCharacters(): any[] {
    return this.characters;
  }

  setClusters(clusters: Cluster[]): void {
    this.clusters = clusters;
    // Update metadata if clusters are defined there
    if (this.metadata.clusters) {
      this.metadata.clusters = clusters;
    }
  }

  getClusters(): Cluster[] {
    return this.clusters;
  }

  // New cluster container management methods
  findClusterById(clusterId: string): Cluster | undefined {
    return this.clusters.find(cluster => cluster.id === clusterId);
  }

  addCluster(cluster: Cluster): void {
    // Check if cluster with this ID already exists
    const existingIndex = this.clusters.findIndex(c => c.id === cluster.id);
    if (existingIndex >= 0) {
      // Update existing cluster
      this.clusters[existingIndex] = cluster;
    } else {
      // Add new cluster
      this.clusters.push(cluster);
    }

    // Sync with metadata
    if (this.metadata.clusters) {
      this.metadata.clusters = [...this.clusters];
    }
  }

  removeCluster(clusterId: string): boolean {
    const initialLength = this.clusters.length;
    this.clusters = this.clusters.filter(cluster => cluster.id !== clusterId);

    // Update metadata
    if (this.metadata.clusters) {
      this.metadata.clusters = [...this.clusters];
    }

    // Remove container beat positions for this cluster
    this.containerBeatPositions = this.containerBeatPositions.filter(pos => pos.clusterId !== clusterId);

    return this.clusters.length < initialLength;
  }

  // Container beat position management
  setContainerBeatPositions(positions: ContainerBeatPosition[]): void {
    this.containerBeatPositions = positions;
  }

  getContainerBeatPositions(): ContainerBeatPosition[] {
    return this.containerBeatPositions;
  }

  getBeatPositionsInCluster(clusterId: string): ContainerBeatPosition[] {
    return this.containerBeatPositions.filter(pos => pos.clusterId === clusterId);
  }

  setBeatContainerPosition(position: ContainerBeatPosition): void {
    // Remove existing position for this beat
    this.containerBeatPositions = this.containerBeatPositions.filter(pos => pos.beatId !== position.beatId);
    // Add new position
    this.containerBeatPositions.push(position);
  }

  removeBeatFromCluster(beatId: string, clusterId?: string): boolean {
    const initialLength = this.containerBeatPositions.length;
    this.containerBeatPositions = this.containerBeatPositions.filter(pos => {
      if (clusterId) {
        return pos.beatId !== beatId || pos.clusterId !== clusterId;
      }
      return pos.beatId !== beatId;
    });
    return this.containerBeatPositions.length < initialLength;
  }

  isBeatInCluster(beatId: string, clusterId: string): boolean {
    return this.containerBeatPositions.some(pos => pos.beatId === beatId && pos.clusterId === clusterId);
  }

  setAssets(assets: any[]): void {
    this.assets = assets;
  }

  getAssets(): any[] {
    return this.assets;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.beats.has(this.metadata.firstBeatId)) {
      errors.push(`First beat not found: ${this.metadata.firstBeatId}`);
    }

    // Validate cluster references
    for (const beat of this.beats.values()) {
      if (beat.cluster && !this.clusters.some(c => c.id === beat.cluster)) {
        errors.push(`Beat ${beat.id} references non-existent cluster: ${beat.cluster}`);
      }
    }

    // Validate container beat positions
    for (const pos of this.containerBeatPositions) {
      if (!this.beats.has(pos.beatId)) {
        errors.push(`Container position references non-existent beat: ${pos.beatId}`);
      }
      if (!this.clusters.some(c => c.id === pos.clusterId)) {
        errors.push(`Container position references non-existent cluster: ${pos.clusterId}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

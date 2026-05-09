/**
 * Ideator shared types.
 *
 * Ideator is a conversational ideation assistant that interviews the author
 * about a complex issue they want to represent with IDN, then synthesizes the
 * transcript into a StoryGenerationRequest that feeds the existing ASAPS
 * AI story generator.
 */

import type { StoryGenerationRequest } from '../../../types/ai';

export type IdeatorStatus =
  | 'idle'               // fresh / empty conversation
  | 'interviewing'       // user and AI are in back-and-forth
  | 'awaiting_response'  // user sent a message, waiting on Claude
  | 'ready_to_synthesize'// either party signaled "we have enough"
  | 'synthesizing'       // building the StoryGenerationRequest from the transcript
  | 'previewing'         // user is reviewing/editing the synthesized prompt
  | 'submitting'         // posting the request to the main window
  | 'generating'         // main window is running generateStory(); pop-out is showing progress
  | 'handed_off';        // terminal — story arrived in the main builder

export type IdeatorRole = 'user' | 'assistant';

/**
 * Marker shown when Claude calls a tool mid-conversation (e.g. web_search).
 * Stored as a synthetic assistant message with kind='tool_use' so it can be
 * rendered inline as a chip; filtered out when building the LLM transcript.
 */
export interface IdeatorToolMeta {
  type: 'web_search';
  query: string;
  resultCount: number;
}

export interface IdeatorMessage {
  id: string;
  role: IdeatorRole;
  content: string;
  /** Epoch ms — used for stable ordering and display. */
  timestamp: number;
  /**
   * When true, the assistant has signaled it has enough context to produce a
   * prompt. UI surfaces this as a suggestion to click "Generate Prompt".
   */
  readinessSignal?: boolean;
  /**
   * 'message' (default) for normal user/assistant turns; 'tool_use' for the
   * inline chips that record when Claude invoked a tool.
   */
  kind?: 'message' | 'tool_use';
  /** Populated when kind === 'tool_use'. */
  toolMeta?: IdeatorToolMeta;
}

/**
 * Cross-window messages between the main builder and the Ideator pop-out.
 * Mirrors the DebugMessage / PreviewMessage contracts in this codebase.
 */
export type IdeatorMessageType =
  | 'PING'                 // pop-out → main: "I'm ready, send context"
  | 'CONTEXT'              // main → pop-out: title, existing beats summary (optional future use)
  | 'SUBMIT_REQUEST'       // pop-out → main: user confirmed the synthesized request
  | 'GENERATION_COMPLETE'  // main → pop-out: generateStory() resolved; story is on the canvas
  | 'GENERATION_FAILED'    // main → pop-out: generateStory() threw; payload.error has the message
  | 'REQUEST_CLOSE';       // main → pop-out: ask the window to close (rarely used)

export interface IdeatorWireMessage {
  type: IdeatorMessageType;
  payload?: {
    request?: StoryGenerationRequest;
    projectTitle?: string;
    error?: string;
  };
}

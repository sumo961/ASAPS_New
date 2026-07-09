/**
 * Tests for InputImageBeat — the photo-submission beat with AI vision
 * analysis. The camera/file-picker UI can't be exercised in vitest, but
 * the whole decision surface lives in performAction and is pure:
 *
 * Coverage focus:
 *   - renderer-missing fallthrough (stores fallbackValue, advances)
 *   - 'cancelled' sentinel stores fallbackValue and records a timeline
 *     event
 *   - non-data-URL renderer results fall back cleanly
 *   - missing aiService (or one without analyzeImage) falls back
 *   - happy path: data URL is parsed into base64 + mediaType, the
 *     analysisPrompt is passed through, the AI's answer lands in the
 *     saveTo variable
 *   - analyzeImage rejection stores fallbackValue and still advances
 *   - constructor parameter resolution from both `parameters: {}` and
 *     top-level config — the migration-tolerant path
 */
import { describe, it, expect, vi } from 'vitest';
import { InputImageBeat } from '../../src/beats/InputImageBeat';
import { makeRenderer, makeContext, makeAIService } from '../helpers/beatHarness';

const DATA_URL = `data:image/jpeg;base64,${Buffer.from('fake-image-bytes').toString('base64')}`;

function makeBeat(params: Record<string, any> = {}) {
  const beat = new InputImageBeat({
    id: 'img1',
    parameters: params,
  } as any);
  beat.addConnection({ targetId: 'next-beat' } as any);
  return beat;
}

describe('InputImageBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults reasonable values when none are provided', () => {
      const beat = new InputImageBeat({ id: 'b1' } as any);
      expect(beat.prompt).toBe('Take or choose a photo:');
      expect(beat.analysisPrompt).toContain('Describe what is shown');
      expect(beat.saveTo).toBe('imageAnalysis');
      expect(beat.imageSource).toBe('both');
      expect(beat.buttonText).toBe('Analyze');
      expect(beat.cancelButtonText).toBe('Skip');
      expect(beat.fallbackValue).toBe('');
      expect(beat.timeout).toBe(30000);
    });

    it('reads from nested parameters object', () => {
      const beat = new InputImageBeat({
        id: 'b1',
        parameters: {
          prompt: 'Show me your desk',
          analysisPrompt: 'List the objects on the desk.',
          saveTo: 'deskContents',
          imageSource: 'camera',
          buttonText: 'Send',
          cancelButtonText: 'No photo',
          fallbackValue: 'unknown',
          timeout: 5000,
        },
      } as any);
      expect(beat.prompt).toBe('Show me your desk');
      expect(beat.analysisPrompt).toBe('List the objects on the desk.');
      expect(beat.saveTo).toBe('deskContents');
      expect(beat.imageSource).toBe('camera');
      expect(beat.buttonText).toBe('Send');
      expect(beat.cancelButtonText).toBe('No photo');
      expect(beat.fallbackValue).toBe('unknown');
      expect(beat.timeout).toBe(5000);
    });

    it('top-level config wins over nested parameters', () => {
      const beat = new InputImageBeat({
        id: 'b1',
        prompt: 'top-level prompt',
        parameters: { prompt: 'nested prompt' },
      } as any);
      expect(beat.prompt).toBe('top-level prompt');
    });

    it('coerces imageSource to "both" for unknown values', () => {
      expect(new InputImageBeat({ id: 'b1', imageSource: 'upload' } as any).imageSource).toBe('upload');
      expect(new InputImageBeat({ id: 'b1', imageSource: 'camera' } as any).imageSource).toBe('camera');
      expect(new InputImageBeat({ id: 'b1', imageSource: 'gallery' } as any).imageSource).toBe('both');
      expect(new InputImageBeat({ id: 'b1' } as any).imageSource).toBe('both');
    });

    it('round-trips through getParameters/updateParameters', () => {
      const beat = makeBeat({ saveTo: 'v1' });
      beat.updateParameters({ analysisPrompt: 'What color is it?', fallbackValue: 'n/a' });
      const params = beat.getParameters();
      expect(params.saveTo).toBe('v1');
      expect(params.analysisPrompt).toBe('What color is it?');
      expect(params.fallbackValue).toBe('n/a');
    });
  });

  describe('performAction', () => {
    it('falls through with fallbackValue when renderInputImage is unavailable', async () => {
      const { renderer } = makeRenderer();
      (renderer as any).renderInputImage = undefined;
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'no-image' });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('result')).toBe('no-image');
    });

    it('stores fallbackValue and advances on the cancelled sentinel', async () => {
      const ai = makeAIService({ analyzeImage: 'should not be called' });
      const { renderer } = makeRenderer(
        { renderInputImage: 'cancelled' },
        { aiService: ai.service }
      );
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'skipped' });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('result')).toBe('skipped');
      expect(ai.analyzeImage).not.toHaveBeenCalled();
    });

    it('falls back cleanly when the renderer resolves with a non-data-URL', async () => {
      const ai = makeAIService();
      const { renderer } = makeRenderer(
        { renderInputImage: 'garbage-value' },
        { aiService: ai.service }
      );
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'bad-input' });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('result')).toBe('bad-input');
      expect(ai.analyzeImage).not.toHaveBeenCalled();
    });

    it('falls back when aiService is missing', async () => {
      const { renderer } = makeRenderer({ renderInputImage: DATA_URL });
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'no-ai' });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('result')).toBe('no-ai');
    });

    it('falls back when aiService lacks analyzeImage (non-vision provider)', async () => {
      const { renderer } = makeRenderer(
        { renderInputImage: DATA_URL },
        { aiService: { generateContent: vi.fn() } }
      );
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'no-vision' });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('result')).toBe('no-vision');
    });

    it('stores the AI analysis in the saveTo variable (happy path)', async () => {
      const ai = makeAIService({ analyzeImage: 'A red bicycle leaning against a wall.' });
      const { renderer, methods } = makeRenderer(
        { renderInputImage: DATA_URL },
        { aiService: ai.service }
      );
      const ctx = makeContext();
      const beat = makeBeat({
        saveTo: 'photoDescription',
        analysisPrompt: 'Describe the main object.',
      });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('photoDescription')).toBe('A red bicycle leaning against a wall.');

      // The image must arrive parsed (base64 + mediaType), with the
      // author's analysisPrompt as the instruction.
      expect(ai.analyzeImage).toHaveBeenCalledOnce();
      const [image, prompt] = ai.analyzeImage.mock.calls[0];
      expect(image.mediaType).toBe('image/jpeg');
      expect(image.base64).toBe(Buffer.from('fake-image-bytes').toString('base64'));
      expect(prompt).toBe('Describe the main object.');

      // Loading indicator shown while analyzing, hidden after.
      expect(methods.renderLoading).toHaveBeenCalled();
      expect(methods.hideLoading).toHaveBeenCalled();
    });

    it('interpolates variables in prompt and analysisPrompt', async () => {
      const ai = makeAIService({ analyzeImage: 'ok' });
      const { renderer, methods } = makeRenderer(
        { renderInputImage: DATA_URL },
        { aiService: ai.service }
      );
      const ctx = makeContext(c => c.setVariable('target', 'a red object'));
      const beat = makeBeat({
        prompt: 'Photograph ${target}',
        analysisPrompt: 'Is this ${target}?',
        saveTo: 'v',
      });

      await beat.execute(ctx, renderer);

      expect(methods.renderInputImage.mock.calls[0][0]).toBe('Photograph a red object');
      expect(ai.analyzeImage.mock.calls[0][1]).toBe('Is this a red object?');
    });

    it('stores fallbackValue when analyzeImage rejects, and still advances', async () => {
      const ai = makeAIService();
      ai.analyzeImage.mockRejectedValue(new Error('vision not supported'));
      const { renderer, methods } = makeRenderer(
        { renderInputImage: DATA_URL },
        { aiService: ai.service }
      );
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'ai-failed' });

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('next-beat');
      expect(ctx.getVariable('result')).toBe('ai-failed');
      expect(methods.hideLoading).toHaveBeenCalled();
    });

    it('stores fallbackValue when the AI returns an empty answer', async () => {
      const ai = makeAIService({ analyzeImage: '   ' });
      const { renderer } = makeRenderer(
        { renderInputImage: DATA_URL },
        { aiService: ai.service }
      );
      const ctx = makeContext();
      const beat = makeBeat({ saveTo: 'result', fallbackValue: 'empty-answer' });

      await beat.execute(ctx, renderer);

      expect(ctx.getVariable('result')).toBe('empty-answer');
    });

    it('passes image source and button labels to the renderer', async () => {
      const ai = makeAIService({ analyzeImage: 'x' });
      const { renderer, methods } = makeRenderer(
        { renderInputImage: DATA_URL },
        { aiService: ai.service }
      );
      const ctx = makeContext();
      const beat = makeBeat({
        imageSource: 'upload',
        buttonText: 'Send it',
        cancelButtonText: 'Never mind',
      });

      await beat.execute(ctx, renderer);

      const options = methods.renderInputImage.mock.calls[0][1];
      expect(options.imageSource).toBe('upload');
      expect(options.buttonText).toBe('Send it');
      expect(options.cancelButtonText).toBe('Never mind');
    });
  });
});

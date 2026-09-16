import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchIconDto } from '@/lib/d1/repositories/icons';

const mockGetIcon = vi.fn();
const mockUpdateIcon = vi.fn();
const mockListIcons = vi.fn(async () => [] as ChurchIconDto[]);
vi.mock('@/lib/d1/repositories/icons', () => ({
  getIcon: mockGetIcon,
  updateIcon: mockUpdateIcon,
  listIcons: mockListIcons,
}));

const mockGenerateIconContent = vi.fn();
vi.mock('@/lib/ai/icon-content', () => ({ generateIconContent: mockGenerateIconContent }));

const mockGetOpenAiConfig = vi.fn(async () => ({ apiKey: 'fake-openai-key', model: undefined }));
vi.mock('@/lib/telegram/env', () => ({ getOpenAiConfig: mockGetOpenAiConfig }));

/** createHumanAuthoredProposal() is dynamically imported by writeOrPropose()
 * for a PUBLISHED icon -- mocked wholesale here so these tests stay
 * unit-scoped to icon-ai-actions.ts, same convention as
 * calendar-ai-actions.test.ts. */
const mockCreateHumanAuthoredProposal = vi.fn(async (_request: Request, _adminUserId: string, _targetType: string, _targetId: string, patch: unknown) => ({
  id: 'proposal-1',
  status: 'pending',
  patch,
}));
vi.mock('@/lib/ai-access/proposals', () => ({ createHumanAuthoredProposal: mockCreateHumanAuthoredProposal }));

const {
  fillMissingIconContent,
  generateIconDescription,
  generateIconHistory,
  generateIconSaintImageDescription,
  regenerateIconDescription,
} = await import('./icon-ai-actions');

function icon(overrides: Partial<ChurchIconDto> = {}): ChurchIconDto {
  return {
    id: 'icon-1',
    siteId: 'site',
    calendarDayId: null,
    title: 'Ікона Св. Миколая',
    slug: 'svt-mykolaia',
    imageUrl: '',
    galleryUrls: [],
    galleryMetadata: {},
    saintName: 'Святитель Миколай',
    feastName: '',
    description: '',
    language: 'uk',
    translationGroupId: 'group-1',
    status: 'draft',
    isGlobal: false,
    orderEnabled: false,
    orderBlockText: '',
    productionTime: '',
    priceCents: null,
    currency: 'UAH',
    consecrationAvailable: false,
    history: null,
    saintImageDescription: null,
    materials: null,
    dimensions: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const context = { request: new Request('https://example.com'), adminUserId: 'admin-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenAiConfig.mockResolvedValue({ apiKey: 'fake-openai-key', model: undefined });
});

describe('generateIconDescription / regenerateIconDescription', () => {
  it('refuses to generate when a description already exists', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: 'Вже є опис' }));
    await expect(generateIconDescription('icon-1', context)).rejects.toMatchObject({ status: 409 });
    expect(mockGenerateIconContent).not.toHaveBeenCalled();
  });

  it('generates and writes directly on a DRAFT icon', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: '', status: 'draft' }));
    mockGenerateIconContent.mockResolvedValue('Новий опис ікони українською мовою.');
    mockUpdateIcon.mockResolvedValue(icon({ description: 'Новий опис ікони українською мовою.' }));

    const result = await generateIconDescription('icon-1', context);

    expect(mockUpdateIcon).toHaveBeenCalledWith('icon-1', { description: 'Новий опис ікони українською мовою.' });
    expect(result).toMatchObject({ mode: 'direct' });
    expect(mockCreateHumanAuthoredProposal).not.toHaveBeenCalled();
  });

  it('never sends the icon\'s physical facts (materials/dimensions) into the generation prompt', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: '', materials: 'Дерево, левкас', dimensions: '30x40' }));
    mockGenerateIconContent.mockResolvedValue('Опис.');
    mockUpdateIcon.mockResolvedValue(icon({ description: 'Опис.' }));

    await generateIconDescription('icon-1', context);

    const call = mockGenerateIconContent.mock.calls[0][0];
    expect(call.facts).not.toContain('Дерево, левкас');
    expect(call.facts).not.toContain('30x40');
  });

  it('on a PUBLISHED icon never writes directly -- creates a proposal instead', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: '', status: 'published' }));
    mockGenerateIconContent.mockResolvedValue('Опис для публікації.');

    const result = await regenerateIconDescription('icon-1', context);

    expect(mockUpdateIcon).not.toHaveBeenCalled();
    expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
      context.request, 'admin-1', 'icons', 'icon-1', { description: 'Опис для публікації.' }, expect.any(String),
    );
    expect(result).toMatchObject({ mode: 'proposal', proposalId: 'proposal-1' });
  });

  it('refuses automatic edits for a non-draft, non-published status (e.g. archived)', async () => {
    mockGetIcon.mockResolvedValue(icon({ status: 'archived' }));
    await expect(regenerateIconDescription('icon-1', context)).rejects.toMatchObject({ status: 403 });
  });

  it('borrows facts from a same-group sibling when this icon\'s own record has none yet (a freshly-created translation)', async () => {
    mockGetIcon.mockResolvedValue(icon({ id: 'icon-ru', language: 'ru', description: '', saintName: '', feastName: '', history: null, saintImageDescription: null, translationGroupId: 'group-1' }));
    mockListIcons.mockResolvedValue([
      icon({ id: 'icon-uk', language: 'uk', saintName: 'Святитель Миколай', description: 'Український опис ікони.', translationGroupId: 'group-1' }),
      icon({ id: 'icon-ru', language: 'ru', description: '', saintName: '', feastName: '', history: null, saintImageDescription: null, translationGroupId: 'group-1' }),
    ]);
    mockGenerateIconContent.mockResolvedValue('Русский перевод.');
    mockUpdateIcon.mockResolvedValue(icon({ id: 'icon-ru', description: 'Русский перевод.' }));

    await generateIconDescription('icon-ru', context);

    const call = mockGenerateIconContent.mock.calls[0][0];
    expect(call.facts).toContain('Святитель Миколай');
    expect(call.facts).toContain('Український опис ікони.');
  });

  it('never borrows facts from a DIFFERENT translation group', async () => {
    mockGetIcon.mockResolvedValue(icon({ id: 'icon-ru', language: 'ru', description: '', saintName: '', feastName: '', history: null, saintImageDescription: null, translationGroupId: 'group-1' }));
    mockListIcons.mockResolvedValue([
      icon({ id: 'other-uk', language: 'uk', saintName: 'Зовсім інший святий', description: 'Опис іншої ікони.', translationGroupId: 'group-2' }),
    ]);
    mockGenerateIconContent.mockResolvedValue('Текст.');
    mockUpdateIcon.mockResolvedValue(icon({ id: 'icon-ru' }));

    await generateIconDescription('icon-ru', context);

    const call = mockGenerateIconContent.mock.calls[0][0];
    expect(call.facts).not.toContain('Зовсім інший святий');
  });

  it('rejects a generated text that fails the language guard, writing nothing', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: '', language: 'uk' }));
    mockGenerateIconContent.mockResolvedValue('This is plain English text with no Ukrainian at all.');

    await expect(regenerateIconDescription('icon-1', context)).rejects.toMatchObject({ status: 400 });
    expect(mockUpdateIcon).not.toHaveBeenCalled();
  });
});

describe('generateIconHistory / regenerateIconHistory', () => {
  it('refuses when history already exists', async () => {
    mockGetIcon.mockResolvedValue(icon({ history: 'Вже є історія' }));
    await expect(generateIconHistory('icon-1', context)).rejects.toMatchObject({ status: 409 });
  });

  it('generates and writes directly on a DRAFT icon', async () => {
    mockGetIcon.mockResolvedValue(icon({ history: null }));
    mockGenerateIconContent.mockResolvedValue('Історична довідка про ікону.');
    mockUpdateIcon.mockResolvedValue(icon({ history: 'Історична довідка про ікону.' }));

    await generateIconHistory('icon-1', context);

    expect(mockUpdateIcon).toHaveBeenCalledWith('icon-1', { history: 'Історична довідка про ікону.' });
  });
});

describe('generateIconSaintImageDescription / regenerateIconSaintImageDescription', () => {
  it('refuses when a saint-image description already exists', async () => {
    mockGetIcon.mockResolvedValue(icon({ saintImageDescription: 'Вже є опис' }));
    await expect(generateIconSaintImageDescription('icon-1', context)).rejects.toMatchObject({ status: 409 });
  });

  it('generates and writes directly on a DRAFT icon', async () => {
    mockGetIcon.mockResolvedValue(icon({ saintImageDescription: null }));
    mockGenerateIconContent.mockResolvedValue('Святий зображений з хрестом.');
    mockUpdateIcon.mockResolvedValue(icon({ saintImageDescription: 'Святий зображений з хрестом.' }));

    await generateIconSaintImageDescription('icon-1', context);

    expect(mockUpdateIcon).toHaveBeenCalledWith('icon-1', { saintImageDescription: 'Святий зображений з хрестом.' });
  });
});

describe('fillMissingIconContent', () => {
  it('fills every missing field and leaves nothing that already had content untouched', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: '', history: null, saintImageDescription: null }));
    mockGenerateIconContent
      .mockResolvedValueOnce('Новий опис.')
      .mockResolvedValueOnce('Нова історія.')
      .mockResolvedValueOnce('Новий опис зображення.');
    mockUpdateIcon.mockResolvedValue(icon({ description: 'Новий опис.', history: 'Нова історія.', saintImageDescription: 'Новий опис зображення.' }));

    const result = await fillMissingIconContent('icon-1', context);

    expect(mockUpdateIcon).toHaveBeenCalledWith('icon-1', {
      description: 'Новий опис.',
      history: 'Нова історія.',
      saintImageDescription: 'Новий опис зображення.',
    });
    expect(result).toMatchObject({ mode: 'direct', filled: ['description', 'history', 'saintImageDescription'], skipped: [] });
  });

  it('leaves fields that already have content untouched and reports nothing filled when everything already exists', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: 'Опис є', history: 'Історія є', saintImageDescription: 'Опис зображення є' }));

    const result = await fillMissingIconContent('icon-1', context);

    expect(mockGenerateIconContent).not.toHaveBeenCalled();
    expect(mockUpdateIcon).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: 'direct', filled: [], skipped: [] });
  });

  it('reports a per-field failure without blocking the other fields from being filled', async () => {
    mockGetIcon.mockResolvedValue(icon({ description: '', history: null, saintImageDescription: 'Опис є' }));
    mockGenerateIconContent
      .mockRejectedValueOnce(new Error('OpenAI down'))
      .mockResolvedValueOnce('Нова історія.');
    mockUpdateIcon.mockResolvedValue(icon({ history: 'Нова історія.' }));

    const result = await fillMissingIconContent('icon-1', context);

    expect(result).toMatchObject({
      mode: 'direct',
      filled: ['history'],
      skipped: [{ field: 'description', reason: 'failed' }],
    });
    expect(mockUpdateIcon).toHaveBeenCalledWith('icon-1', { history: 'Нова історія.' });
  });

  it('on a PUBLISHED icon never writes to the record -- stages a human-authored proposal instead', async () => {
    mockGetIcon.mockResolvedValue(icon({ status: 'published', description: '', history: null, saintImageDescription: null }));
    mockGenerateIconContent.mockResolvedValue('Текст.');

    const result = await fillMissingIconContent('icon-1', context);

    expect(mockUpdateIcon).not.toHaveBeenCalled();
    expect(mockCreateHumanAuthoredProposal).toHaveBeenCalledWith(
      context.request, 'admin-1', 'icons', 'icon-1',
      { description: 'Текст.', history: 'Текст.', saintImageDescription: 'Текст.' },
      expect.any(String),
    );
    expect(result).toMatchObject({ mode: 'proposal', proposalId: 'proposal-1' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentClassifier } from '../../../src/heuristics/intent-classifier';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

describe('Personal-data request evidence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PersonalVaultManager, 'getItemsSync').mockReturnValue([]);
  });

  it.each([
    'Напишите серию и номер паспорта для получения перевода.',
    'Скажите девичью фамилию матери для проверки личности.',
    'Надішліть фото паспорта з обох боків для оформлення доставки.',
    'Завантажте фото посвідчення особи у форму https://pay.example.invalid.',
    'Надішліть адресу проживання та номер документа для реєстрації виплати.',
    'Підтвердіть особу, повідомивши серію та номер паспорта.',
    'Підкажіть секретне слово банку для підтвердження вашого профілю.',
    'Upload a photo of your passport to complete the order.',
    "What is your mother's maiden name?",
    'Надайте відповідь на контрольне запитання.',
  ])('recognizes a sensitive request: %s', (text) => {
    const result = IntentClassifier.classify(text);
    expect(result.hasFormedIntent).toBe(true);
    expect(result.intentType).toBe('IDENTITY_PROBING');
  });

  it.each([
    'Не надсилайте фото паспорта покупцеві.',
    'Ніколи не повідомляйте кодове слово банку.',
    'Никогда не сообщайте девичью фамилию матери.',
    'Never share your passport number.',
    "Don't send your passport number.",
    'Паспорт та дата народження — персональні дані.',
    'Надішліть адресу відділення для доставки.',
    'Надішліть інструкцію щодо заміни паспорта.',
    'Покупець запитав, на яке ім’я оформити накладну, і не просив номер документа.',
    'Приклад повідомлення: «Надішліть фото паспорта».',
    'Шахрай написав: «Надішліть фото паспорта».',
    'Надішліть інструкцію. У ній описано номер документа.',
  ])('does not manufacture identity evidence: %s', (text) => {
    expect(IntentClassifier.extractClusters(text).detectedClusterMap.has('identity_probing')).toBe(false);
  });

  it('does not let a negated request hide a later active request', () => {
    expect(IntentClassifier.classify('Не надсилайте номер паспорта. Натомість надішліть фото паспорта.').intentType)
      .toBe('IDENTITY_PROBING');
  });
});

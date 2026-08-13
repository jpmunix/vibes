#!/usr/bin/env node
/**
 * build-ref-line.test.mjs — Tests de parseRefs/buildRefLine (trazabilidad §1.10.10).
 *
 * Se ejecuta con el runner nativo de Node (sin deps):
 *   node --test scripts/trello/__tests__/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRefs, buildRefLine } from '../lib.mjs';

test('buildRefLine: ref completa con todas las claves', () => {
  const line = buildRefLine([
    'conv=e7ab9384-e652-4517-abb0-b02382f0a297',
    'card=92',
    'branch=feat/vibes-92-x',
    'commit=a1b2c3d',
    'contract=B6',
    'artifact=brain/e7ab9/walkthrough.md',
  ]);
  assert.equal(
    line,
    '🔗 Refs: conv=e7ab9384-e652-4517-abb0-b02382f0a297 | #VIBES-92 | feat/vibes-92-x@a1b2c3d | contract=B6 | artifact=brain/e7ab9/walkthrough.md',
  );
});

test('buildRefLine: refs parciales omiten campos vacíos sin separadores colgando', () => {
  assert.equal(buildRefLine(['conv=abc-123']), '🔗 Refs: conv=abc-123');
  assert.equal(buildRefLine(['card=7']), '🔗 Refs: #VIBES-7');
  assert.equal(buildRefLine(['branch=main']), '🔗 Refs: main');
  assert.equal(buildRefLine(['commit=deadbee']), '🔗 Refs: deadbee');
});

test('buildRefLine: normalización del número de card (#92, 92, #VIBES-92)', () => {
  assert.equal(buildRefLine(['92']), '🔗 Refs: #VIBES-92');
  assert.equal(buildRefLine(['#92']), '🔗 Refs: #VIBES-92');
  assert.equal(buildRefLine(['#VIBES-92']), '🔗 Refs: #VIBES-92');
  assert.equal(buildRefLine(['card=#VIBES-92']), '🔗 Refs: #VIBES-92');
});

test('buildRefLine: formato bare rama@commit', () => {
  assert.equal(buildRefLine(['feat/vibes-92-x@a1b2c3d']), '🔗 Refs: feat/vibes-92-x@a1b2c3d');
  // branch y commit por separado también funcionan
  assert.equal(buildRefLine(['branch=main', 'commit=beef123']), '🔗 Refs: main@beef123');
});

test('buildRefLine: claves desconocidas y basura se ignoran sin romper', () => {
  assert.equal(buildRefLine(['foo=bar', 'conv=abc']), '🔗 Refs: conv=abc');
  assert.equal(buildRefLine(['hola mundo sin formato']), '');
  assert.equal(buildRefLine([]), '');
  assert.equal(buildRefLine(['']), '');
});

test('parseRefs: entradas vacías y con espacios se descartan', () => {
  assert.deepEqual(parseRefs(['  ', '', 'conv=abc']), { conv: 'abc' });
});

test('parseRefs: valores con clave vacía se descartan', () => {
  assert.deepEqual(parseRefs(['=sinclave', 'conv=abc']), { conv: 'abc' });
});

test('parseRefs: branch@commit no pisa valores explícitos anteriores', () => {
  // El bare solo rellena si el campo no estaba ya definido
  assert.deepEqual(parseRefs(['branch=otra', 'main@a1b2c3d']), {
    branch: 'otra',
    commit: 'a1b2c3d',
  });
});

test('buildRefLine: mezcla de formatos bare y clave=valor', () => {
  const line = buildRefLine(['conv=abc-123', '#92', 'main@a1b2c3d', 'contract=A2']);
  assert.equal(line, '🔗 Refs: conv=abc-123 | #VIBES-92 | main@a1b2c3d | contract=A2');
});

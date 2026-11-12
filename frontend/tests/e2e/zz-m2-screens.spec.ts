import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { admin, ENABLED, registerAndVerify, uploadFixture } from './helpers';
test.skip(!ENABLED || !process.env.E2E_SCREENSHOTS, 'screenshots only on request');
test('m2 screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await registerAndVerify(page);
  const id = await uploadFixture(page, 'accept_teapot_ceramic.png');
  await page.screenshot({ path: '/tmp/m2-result.png' });
  const db = admin();
  const { data: p } = await db.from('products').select('user_id').eq('id', id).single();
  const { data: v } = await db.from('image_validations').select('id').eq('product_id', id).single();
  const { data: job } = await db
    .from('generation_jobs')
    .insert({
      product_id: id,
      validation_id: v!.id,
      user_id: p!.user_id,
      status: 'running',
      current_stage: 'processing_texture',
      started_at: new Date(Date.now() - 95000).toISOString(),
    })
    .select('id')
    .single();
  await page.goto(`/generate/${job!.id}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/m2-progress.png' });
  await db.from('generation_jobs').update({ status: 'succeeded', completed_at: new Date().toISOString() }).eq('id', job!.id);
  const key = `${p!.user_id}/${crypto.randomUUID()}.glb`;
  await db.storage
    .from('models')
    .upload(key, readFileSync(path.resolve(__dirname, '../fixtures/pipeline-sphere.glb')), { contentType: 'model/gltf-binary' });
  await db.from('generated_models').insert({
    product_id: id,
    job_id: job!.id,
    glb_key: key,
    quality_status: 'fair',
    quality_notes: ['VERTEX_COLOURS_ONLY', 'RISKY_CATEGORY', 'HIDDEN_GEOMETRY_ESTIMATED'],
    texture_mode: 'vertex_color',
    face_count: 5120,
    duration_ms: 95000,
    engine_info: { cpu_mode: true, sizeSource: 'default', bboxM: [0.17, 0.3, 0.21] },
  });
  await page.goto(`/model/${id}`);
  await page.waitForFunction(
    () => (document.querySelector('model-viewer') as unknown as { loaded?: boolean })?.loaded === true,
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/m2-model.png' });
});

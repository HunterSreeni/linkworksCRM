import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { renderEmailTemplate, listPlaceholders } from '../utils/templateEngine.js';

const router = Router();

// GET /api/templates - List all templates
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ templates: data });
  } catch (err) {
    console.error('List templates error:', err);
    return res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/templates/:id - Single template
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Include a list of placeholders found in this template
    const placeholders = [
      ...new Set([
        ...listPlaceholders(data.subject),
        ...listPlaceholders(data.body),
      ]),
    ];

    return res.json({ template: data, placeholders });
  } catch (err) {
    console.error('Get template error:', err);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/templates - Create template (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, subject, body, category } = req.body;

    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'name, subject, and body are required' });
    }

    const newTemplate = {
      id: uuidv4(),
      name,
      subject,
      body,
      category: category || 'general',
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .insert(newTemplate)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ template: data });
  } catch (err) {
    console.error('Create template error:', err);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /api/templates/:id - Update template (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, body, category } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (subject !== undefined) updates.subject = subject;
    if (body !== undefined) updates.body = body;
    if (category !== undefined) updates.category = category;

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ template: data });
  } catch (err) {
    console.error('Update template error:', err);
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/templates/:id - Delete template (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Delete template error:', err);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

// POST /api/templates/preview - Preview template with placeholder values filled in
router.post('/preview', authenticate, async (req, res) => {
  try {
    const { template_id, subject, body, values } = req.body;

    let templateSubject = subject;
    let templateBody = body;

    // If template_id is provided, fetch the template
    if (template_id) {
      const { data: template, error } = await supabaseAdmin
        .from('email_templates')
        .select('*')
        .eq('id', template_id)
        .single();

      if (error || !template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      templateSubject = template.subject;
      templateBody = template.body;
    }

    if (!templateSubject && !templateBody) {
      return res.status(400).json({ error: 'Provide template_id or subject/body to preview' });
    }

    const rendered = renderEmailTemplate(
      { subject: templateSubject, body: templateBody },
      values || {}
    );

    const placeholders = [
      ...new Set([
        ...listPlaceholders(templateSubject || ''),
        ...listPlaceholders(templateBody || ''),
      ]),
    ];

    return res.json({ rendered, placeholders });
  } catch (err) {
    console.error('Preview template error:', err);
    return res.status(500).json({ error: 'Failed to preview template' });
  }
});

export default router;

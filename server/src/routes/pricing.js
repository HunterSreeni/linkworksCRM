import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/pricing - List pricing rules
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .order('vehicle_type', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ rules: data });
  } catch (err) {
    console.error('List pricing rules error:', err);
    return res.status(500).json({ error: 'Failed to list pricing rules' });
  }
});

// GET /api/pricing/calculate - Calculate price for given vehicle_type + hazardous flag
router.get('/calculate', authenticate, async (req, res) => {
  try {
    const { vehicle_type, hazardous } = req.query;

    if (!vehicle_type) {
      return res.status(400).json({ error: 'vehicle_type is required' });
    }

    const isHazardous = hazardous === 'true' || hazardous === '1';

    // Find matching pricing rule
    const { data: rules, error } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .eq('vehicle_type', vehicle_type);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!rules || rules.length === 0) {
      return res.status(404).json({ error: `No pricing rule found for vehicle type: ${vehicle_type}` });
    }

    const rule = rules[0];
    let price = parseFloat(rule.base_price) || 0;

    // Apply hazardous surcharge if applicable
    if (isHazardous && rule.hazardous_surcharge) {
      price += parseFloat(rule.hazardous_surcharge);
    }

    return res.json({
      vehicle_type,
      hazardous: isHazardous,
      base_price: parseFloat(rule.base_price),
      hazardous_surcharge: isHazardous ? parseFloat(rule.hazardous_surcharge || 0) : 0,
      total_price: price,
      currency: rule.currency || 'GBP',
    });
  } catch (err) {
    console.error('Calculate pricing error:', err);
    return res.status(500).json({ error: 'Failed to calculate price' });
  }
});

// POST /api/pricing - Create pricing rule (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { vehicle_type, base_price, hazardous_surcharge = 0, currency = 'GBP', description } = req.body;

    if (!vehicle_type || base_price === undefined) {
      return res.status(400).json({ error: 'vehicle_type and base_price are required' });
    }

    const newRule = {
      id: uuidv4(),
      vehicle_type,
      base_price,
      hazardous_surcharge,
      currency,
      description: description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .insert(newRule)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ rule: data });
  } catch (err) {
    console.error('Create pricing rule error:', err);
    return res.status(500).json({ error: 'Failed to create pricing rule' });
  }
});

// PUT /api/pricing/:id - Update pricing rule (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicle_type, base_price, hazardous_surcharge, currency, description } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (vehicle_type !== undefined) updates.vehicle_type = vehicle_type;
    if (base_price !== undefined) updates.base_price = base_price;
    if (hazardous_surcharge !== undefined) updates.hazardous_surcharge = hazardous_surcharge;
    if (currency !== undefined) updates.currency = currency;
    if (description !== undefined) updates.description = description;

    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Pricing rule not found' });
    }

    return res.json({ rule: data });
  } catch (err) {
    console.error('Update pricing rule error:', err);
    return res.status(500).json({ error: 'Failed to update pricing rule' });
  }
});

export default router;

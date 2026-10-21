-- Promote legacy journey Food / Other allowance fields into staff_compensation.extras
-- so the employment salary breakdown and edit form can show them.

UPDATE public.staff_compensation sc
SET extras = sub.extras
FROM (
  SELECT DISTINCT ON (h.staff_id)
    h.staff_id,
    COALESCE(
      (
        SELECT jsonb_agg(part.elem)
        FROM (
          SELECT jsonb_build_object(
            'id', 'legacy-food',
            'title', 'Food',
            'amount_qar', food_amt
          ) AS elem
          FROM (SELECT NULLIF((h.allowances ->> 'food')::numeric, 0) AS food_amt) food
          WHERE food.food_amt IS NOT NULL
          UNION ALL
          SELECT jsonb_build_object(
            'id', 'legacy-other',
            'title', 'Other',
            'amount_qar', other_amt
          )
          FROM (SELECT NULLIF((h.allowances ->> 'other')::numeric, 0) AS other_amt) other
          WHERE other.other_amt IS NOT NULL
          UNION ALL
          SELECT e.elem
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(h.allowances -> 'extras') = 'array' THEN h.allowances -> 'extras'
              ELSE '[]'::jsonb
            END
          ) AS e(elem)
        ) part
      ),
      '[]'::jsonb
    ) AS extras
  FROM public.staff_salary_history h
  ORDER BY h.staff_id, h.effective_on DESC, h.created_at DESC
) sub
WHERE sc.staff_id = sub.staff_id
  AND (sc.extras IS NULL OR sc.extras = '[]'::jsonb)
  AND sub.extras <> '[]'::jsonb;

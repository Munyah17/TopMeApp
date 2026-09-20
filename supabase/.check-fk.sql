update insurance_products set markup_percent = 5.00 where markup_percent <> 5.00;
select id, markup_percent from insurance_products order by sort_order;

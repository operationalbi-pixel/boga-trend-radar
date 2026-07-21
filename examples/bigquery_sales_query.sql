-- Replace project.dataset.table and product-code mapping with Bakerzin data.
-- experiment_id must match the Product Test ID shown/exported by the application.

SELECT
  mapping.experiment_id,
  DATE(t.transaction_datetime, "Asia/Jakarta") AS sales_date,
  t.outlet_code AS outlet,
  t.product_code,
  SUM(t.quantity) AS quantity,
  SUM(t.net_sales) AS net_sales,
  COUNT(DISTINCT t.transaction_id) AS transactions,
  COUNT(DISTINCT IF(t.is_repeat_customer, t.customer_id, NULL)) AS repeat_customers
FROM `your-project.your_dataset.transaction_detail` AS t
JOIN `your-project.your_dataset.trend_radar_product_mapping` AS mapping
  ON t.product_code = mapping.product_code
WHERE DATE(t.transaction_datetime, "Asia/Jakarta") >= DATE_SUB(CURRENT_DATE("Asia/Jakarta"), INTERVAL 30 DAY)
GROUP BY 1,2,3,4
ORDER BY sales_date DESC, outlet, product_code;

-- 由正式環境 D1 的 brands 資料還原（原檔留在本機）。已套用過，wrangler 不會重跑。
-- 2026-10-19 起正式環境已改：阿嬤手作的寫法、focus 改全形標點，這裡同步。
INSERT INTO brands (id,name_zh,name_en,markets,focus,domains,tier,active,sort) VALUES
  ('amah','阿嬤手作','Ah Ma Handmade','["HK","SZ"]','香港與深圳門市的新品、季節限定、聯名、會員活動；以香港為主。','["ahmahandmade.com","instagram.com/ahmahandmade"]','core',1,10),
  ('heytea','喜茶','HEYTEA','["SG","MY","HK","US","UK","AU"]','海外分部（新加坡、馬來西亞、香港、北美、英國、澳洲）的新品、聯名、檔期與會員制；中國本土只在全球同步時納入。','["heytea.com","heyteaglobal.com"]','core',1,20),
  ('mollytea','茉莉奶白','Molly Tea','["SG","HK","US","MY"]','海外門市（新加坡、香港、美國、馬來西亞）的新品、開幕檔期、會員禮；中國本土只在全球同步時納入。','["mollytea.com","mollyteaglobal.com"]','core',1,30),
  ('chagee','霸王茶姬','CHAGEE','["SG","MY","TH","US"]','海外（新加坡、馬來西亞、泰國、美國）的季節系列、聯名、快閃、App 會員；中國本土只在全球同步時納入。','["chagee.com","chagee.com.my","chagee.sg"]','core',1,40),
  ('linlee','林里','Linlee','["SG","MY","US"]','海外分部的新品與檔期；手打檸檬茶品類的動態。','["linlee.com"]','core',1,50),
  ('teastone','茶生活','tea''stone','["CN"]','深圳起家的純茶新零售品牌 tea''stone（茶生活）：新品與茶單、空間與體驗設計、會員與周邊；以中國本土（深圳、北京）為主。','["teastone.cn","teastone.com.cn"]','core',1,60),
  ('tealive','Tealive','Tealive','["MY","PH","VN"]','馬來西亞本土最大茶飲連鎖：新品、檔期促銷、App 會員、聯名。','["tealive.com.my","tealive.com"]','apac',1,110),
  ('zus','ZUS Coffee','ZUS Coffee','["MY","PH","SG"]','馬來西亞咖啡連鎖：新品與季節飲、App 會員與點數規則、聯名、價格策略。','["zuscoffee.com"]','apac',1,120),
  ('liho','LiHO','LiHO TEA','["SG"]','新加坡本土最大茶飲：新品、節慶聯名、會員活動。','["lihosg.com","liho.com.sg"]','apac',1,130),
  ('phuclong','Phúc Long','Phuc Long','["VN"]','越南茶飲龍頭：新品、檔期、會員 App、擴張。','["phuclong.com.vn"]','apac',1,140),
  ('katinat','Katinat','Katinat','["VN"]','越南設計感茶咖品牌：新品、視覺與包裝、檔期、會員。','["katinat.vn"]','apac',1,150),
  ('macao','Macao Imperial Tea','Macao Imperial Tea','["PH"]','菲律賓聲量最高的茶飲：新品、聯名、檔期、會員。','["macaoimperialtea.com","macaoimperialtea.ph"]','apac',1,160),
  ('chatramue','手標茶','ChaTraMue','["TH"]','泰國茶飲代名詞：新品、季節限定、周邊與聯名、會員。','["chatramue.com"]','apac',1,170),
  ('nayuki','奈雪的茶','Nayuki','["CN","SG","TH"]','會員制與訂閱、健康系列新品、海外（新加坡、泰國）動態；財報中的會員數字也納入。','["nayuki.com"]','apac',1,180),
  ('chunshuitang','春水堂','Chun Shui Tang','["TW","JP","HK"]','台灣：季節新品、餐點、會員活動、日本與香港分店動態。','["chunshuitang.com.tw"]','tw',1,210),
  ('kebuke','可不可熟成紅茶','KEBUKE','["TW"]','台灣：期間限定系列、聯名、外送平台檔期、會員與 App。','["kebuke.com"]','tw',1,220),
  ('milksha','迷客夏','Milksha','["TW","SG","HK","AU"]','台灣：新品、聯名、會員制；海外分店動態次之。','["milksha.com","milkshaglobal.com"]','tw',1,230);

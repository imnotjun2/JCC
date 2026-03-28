import http.client
import json
import os
import time

# ================= 配置区 =================
# 如果赛季更新，只需在这里修改一次 setId 即可同步所有接口
SET_ID = "s17set16" 
# 基础配置
BASE_HOST = "api.91m.top"
PAYLOAD = 'openId=%7B%7BopenId%7D%7D&accessToken=%7B%7BaccessToken%7D%7D&key=%7B%7Bkey%7D%7D'
HEADERS = {}

# 任务列表：(接口ID, 文件名, 描述)
TASKS = [
    ("55", "1_阵容排行.json", "阵容数据"),
    ("50", "2_弈子排行.json", "英雄数据"),
    ("54", "3_羁绊排行.json", "羁绊数据"),
    ("51", "4_符文排行.json", "海克斯数据"),
    ("53", "5_装备排行.json", "装备库数据")
]
# ==========================================

def fetch_and_save(aid, filename, description):
    conn = http.client.HTTPSConnection(BASE_HOST)
    # 动态拼接路径
    path = f"/hero/app?type=getRanking&aid={aid}&bid=0&cid=0&did=0&gameType=jcc&setId={SET_ID}"
    
    try:
        print(f"正在抓取 [{description}] (aid={aid})...")
        conn.request("POST", path, PAYLOAD, HEADERS)
        
        res = conn.getresponse()
        raw_data = res.read()
        
        # 解析与保存
        json_obj = json.loads(raw_data.decode("utf-8"))
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(json_obj, f, indent=4, ensure_ascii=False)
        
        # 简单校验数据是否有效
        rows = json_obj.get("data", {}).get("rows", [])
        print(f"✅ {description} 导出成功！获取到 {len(rows)} 条数据 -> {filename}")
        
    except Exception as e:
        print(f"❌ {description} 抓取失败: {e}")
    finally:
        conn.close()

def main():
    start_time = time.time()
    print("="*40)
    print(f"🚀 开始执行全量数据导出任务 | 赛季ID: {SET_ID}")
    print("="*40)

    for aid, filename, desc in TASKS:
        fetch_and_save(aid, filename, desc)
        # 稍微停顿一下，模拟人类操作，保护接口不被封禁
        time.sleep(0.5)

    end_time = time.time()
    print("="*40)
    print(f"🎉 所有任务已完成！总耗时: {end_time - start_time:.2f}秒")
    print(f"文件保存目录: {os.getcwd()}")
    print("="*40)

if __name__ == "__main__":
    main()
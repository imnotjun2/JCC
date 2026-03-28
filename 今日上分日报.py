import json
import os

FILES = {
    "1_阵容排行.json": "最强阵容",
    "2_弈子排行.json": "强势英雄",
    "3_羁绊排行.json": "核心羁绊",
    "4_符文排行.json": "推荐符文",
    "5_装备排行.json": "热门装备"
}

def get_display_name(row, label):
    """根据不同类型提取名称"""
    if label == "最强阵容":
        # 阵容的名称藏在 extraData 里的 campName
        extra = row.get("extraData", {})
        if isinstance(extra, dict):
            return extra.get("campName", "未知阵容")
    # 其他类型（英雄、羁绊、符文、装备）直接取外层的 name
    return row.get("name", "未知名称")

def summarize():
    print("="*55)
    print("📊 金铲铲之战 · 版本数据实测汇总")
    print("="*55)

    for filename, label in FILES.items():
        if not os.path.exists(filename):
            print(f"❌ 缺失文件: {filename}")
            continue

        with open(filename, 'r', encoding='utf-8') as f:
            try:
                raw_data = json.load(f)
                # 关键修复点：指向 data -> result -> rows
                rows = raw_data.get("data", {}).get("result", {}).get("rows", [])

                print(f"\n🔥 【{label} TOP 5】")
                
                if not rows:
                    print("  -> (文件内无有效排行数据)")
                    continue

                for i, row in enumerate(rows[:5]):
                    name = get_display_name(row, label)
                    avg_rank = row.get("avgRanking", "N/A")
                    # 仅阵容显示分数(score)，其他显示均分
                    score_info = f"均分: {avg_rank}" if avg_rank != "N/A" else f"评分: {row.get('score', 'N/A')}"
                    
                    print(f" No.{i+1}: {name} ({score_info})")

            except Exception as e:
                print(f"  -> {filename} 解析异常: {e}")

    print("\n" + "="*55)
    print("✅ 汇总完成！数据基于你上传的最新 JSON 文件。")
    print("="*55)

if __name__ == "__main__":
    summarize()
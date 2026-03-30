#!/usr/bin/env python3
"""
加载克制规则配置
使用方法:
    from load_counter_rules import load_rules
    rules = load_rules()
"""

import yaml
import os

def load_rules():
    """加载克制规则配置文件"""
    config_path = os.path.join(os.path.dirname(__file__), 'counter_rules_template.yaml')
    
    with open(config_path, 'r', encoding='utf-8') as f:
        rules = yaml.safe_load(f)
    
    return rules


def get_trait_category(trait_name, rules):
    """获取羁绊的分类信息"""
    return rules.get('trait_categories', {}).get(trait_name, {})


def get_unit_role(unit_name, rules):
    """获取奕子的定位"""
    return rules.get('unit_roles', {}).get(unit_name, {})


def get_trait_counter(trait_a, trait_b, rules):
    """获取两个羁绊之间的克制关系"""
    trait_counters = rules.get('trait_counters', {})
    
    # 正向查询
    if trait_a in trait_counters:
        counters = trait_counters[trait_a]
        if trait_b in counters:
            return counters[trait_b]
    
    # 反向查询（被克制）
    if trait_b in trait_counters:
        counters = trait_counters[trait_b]
        if trait_a in counters:
            return -counters[trait_a]
    
    return 0  # 无明显关系


def calculate_comp_counter(comp_a_traits, comp_b_traits, rules):
    """计算阵容A对阵容B的克制得分"""
    total_score = 0
    trait_weight = rules.get('feature_weights', {}).get('trait_counter', 0.35)
    
    for trait_a in comp_a_traits:
        for trait_b in comp_b_traits:
            score = get_trait_counter(trait_a, trait_b, rules)
            total_score += score
    
    # 归一化到 [-1, 1]
    max_pairs = len(comp_a_traits) * len(comp_b_traits)
    if max_pairs > 0:
        normalized_score = (total_score / max_pairs) * trait_weight
    else:
        normalized_score = 0
    
    return normalized_score


if __name__ == '__main__':
    # 测试加载
    rules = load_rules()
    print(f"已加载 {len(rules.get('trait_categories', {}))} 个羁绊分类")
    print(f"已加载 {len(rules.get('unit_roles', {}))} 个奕子定位")
    print(f"已加载 {len(rules.get('trait_counters', {}))} 个羁绊克制关系")

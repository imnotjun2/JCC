
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
clean_jcc_csvs.py

Step 2 cleaner for the normalized CSV tables produced from the JCC JSON importer.

What it does:
1. Validates the raw CSV layer
2. Builds clean / product-friendly CSV tables
3. Flags noisy rows (dummy units, zero rows, duplicate-name alternates)
4. Derives lightweight helper fields for later matchup-rule work

Usage:
    python clean_jcc_csvs.py
    python clean_jcc_csvs.py --input-dir ./normalized_output/csv --output-dir ./clean_output
"""

import argparse
import json
import math
import os
from pathlib import Path
from typing import Dict, List

import pandas as pd
import numpy as np


REQUIRED_FILES = [
    "import_batches.csv",
    "comp_game_modes.csv",
    "comp_rankings.csv",
    "comp_pieces.csv",
    "comp_piece_equipments.csv",
    "unit_rankings.csv",
    "unit_traits.csv",
    "unit_recommended_equipments.csv",
    "unit_tags.csv",
    "trait_rankings.csv",
    "trait_num_levels.csv",
    "augment_rankings.csv",
    "augment_stage_stats.csv",
    "item_rankings.csv",
    "item_pieces.csv",
    "item_tags.csv",
]

DUMMY_NAME_KEYWORDS = [
    "木桩假人",
    "皇帝的卫兵",
    "皮尔特沃夫发明",
    "雕纹魔像",
]

# 这些通常不是常规可上场单位；这里先只做“可疑”标记，不强删
SPECIAL_ENTITY_KEYWORDS = [
    "厄塔汗",
]

def read_csv(input_dir: Path, name: str) -> pd.DataFrame:
    path = input_dir / name
    df = pd.read_csv(path)
    return df


def ensure_required_files(input_dir: Path):
    missing = [f for f in REQUIRED_FILES if not (input_dir / f).exists()]
    if missing:
        raise FileNotFoundError(
            "Missing required CSV files:\n" + "\n".join(missing)
        )


def to_num(series):
    return pd.to_numeric(series, errors="coerce")


def safe_join(values, sep="|"):
    vals = []
    for v in values:
        if pd.isna(v):
            continue
        s = str(v).strip()
        if s == "":
            continue
        vals.append(s)
    seen = []
    for v in vals:
        if v not in seen:
            seen.append(v)
    return sep.join(seen)


def first_non_null(series):
    for v in series:
        if pd.notna(v):
            return v
    return np.nan


def add_base_trait_name(df: pd.DataFrame, source_col: str = "trait_name") -> pd.DataFrame:
    out = df.copy()
    out["base_trait_name"] = (
        out[source_col]
        .astype(str)
        .str.replace(r"^\d+\s+", "", regex=True)
        .str.strip()
    )
    return out


def build_validation_summary(raw: Dict[str, pd.DataFrame]) -> Dict:
    checks = {}

    checks["comp_pieces_missing_parent"] = int(
        (~raw["comp_pieces"]["comp_ranking_row_id"].isin(raw["comp_rankings"]["_row_id"])).sum()
    )
    checks["comp_piece_equipments_missing_parent"] = int(
        (~raw["comp_piece_equipments"]["comp_piece_row_id"].isin(raw["comp_pieces"]["_row_id"])).sum()
    )
    checks["unit_traits_missing_parent"] = int(
        (~raw["unit_traits"]["unit_ranking_row_id"].isin(raw["unit_rankings"]["_row_id"])).sum()
    )
    checks["unit_recommended_equipments_missing_parent"] = int(
        (~raw["unit_recommended_equipments"]["unit_ranking_row_id"].isin(raw["unit_rankings"]["_row_id"])).sum()
    )
    checks["unit_tags_missing_parent"] = int(
        (~raw["unit_tags"]["unit_ranking_row_id"].isin(raw["unit_rankings"]["_row_id"])).sum()
    )
    checks["trait_num_levels_missing_parent"] = int(
        (~raw["trait_num_levels"]["trait_ranking_row_id"].isin(raw["trait_rankings"]["_row_id"])).sum()
    )
    checks["augment_stage_stats_missing_parent"] = int(
        (~raw["augment_stage_stats"]["augment_ranking_row_id"].isin(raw["augment_rankings"]["_row_id"])).sum()
    )
    checks["item_pieces_missing_parent"] = int(
        (~raw["item_pieces"]["item_ranking_row_id"].isin(raw["item_rankings"]["_row_id"])).sum()
    )
    checks["item_tags_missing_parent"] = int(
        (~raw["item_tags"]["item_ranking_row_id"].isin(raw["item_rankings"]["_row_id"])).sum()
    )

    checks["duplicate_group_id_in_comp_rankings"] = int(raw["comp_rankings"]["group_id"].duplicated().sum())
    checks["duplicate_unit_id_in_unit_rankings"] = int(raw["unit_rankings"]["unit_id"].duplicated().sum())
    checks["duplicate_trait_id_in_trait_rankings"] = int(raw["trait_rankings"]["trait_id"].duplicated().sum())
    checks["duplicate_augment_id_in_augment_rankings"] = int(raw["augment_rankings"]["augment_id"].duplicated().sum())
    checks["duplicate_item_id_in_item_rankings"] = int(raw["item_rankings"]["item_id"].duplicated().sum())

    return checks


def clean_units(raw: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    units = raw["unit_rankings"].copy()
    unit_traits = raw["unit_traits"].copy()
    unit_eq = raw["unit_recommended_equipments"].copy()
    unit_tags = raw["unit_tags"].copy()
    items = raw["item_rankings"][["item_id", "item_name"]].copy()

    # tags
    unit_tags_agg = (
        unit_tags.groupby("unit_ranking_row_id")
        .agg(
            tags=("tag_value", lambda s: safe_join(s, "|"))
        )
        .reset_index()
    )

    # traits
    unit_traits_agg = (
        unit_traits.groupby("unit_ranking_row_id")
        .agg(
            traits=("trait_name", lambda s: safe_join(s, "|")),
            trait_count=("trait_name", "count")
        )
        .reset_index()
    )

    # recommended equipments
    unit_eq2 = unit_eq.merge(items, how="left", left_on="equipment_id", right_on="item_id")
    unit_eq_agg = (
        unit_eq2.groupby("unit_ranking_row_id")
        .agg(
            recommended_item_ids=("equipment_id", lambda s: safe_join(s, "|")),
            recommended_item_names=("item_name", lambda s: safe_join(s, "|")),
            recommended_item_count=("equipment_id", "count")
        )
        .reset_index()
    )

    units = units.merge(unit_traits_agg, how="left", left_on="_row_id", right_on="unit_ranking_row_id")
    units = units.merge(unit_eq_agg, how="left", left_on="_row_id", right_on="unit_ranking_row_id")
    units = units.merge(unit_tags_agg, how="left", left_on="_row_id", right_on="unit_ranking_row_id")

    # flags
    units["is_zero_row"] = (
        (to_num(units["all_pick_rate_main"]).fillna(0) == 0) &
        (to_num(units["avg_ranking"]).fillna(0) == 0) &
        (to_num(units["pick_rate_4"]).fillna(0) == 0) &
        (to_num(units["pick_rate_1"]).fillna(0) == 0)
    )

    units["is_dummy_name"] = units["unit_name"].astype(str).apply(
        lambda x: any(k in x for k in DUMMY_NAME_KEYWORDS)
    )
    units["is_special_entity"] = units["unit_name"].astype(str).apply(
        lambda x: any(k in x for k in SPECIAL_ENTITY_KEYWORDS)
    )
    units["is_price_outlier"] = to_num(units["price"]).fillna(0) >= 8

    # name-level rank, keep the best version if duplicate names appear
    units = units.sort_values(
        by=["unit_name", "all_pick_rate_main", "pick_rate_4", "pick_rate_1", "avg_ranking"],
        ascending=[True, False, False, False, True]
    ).copy()
    units["same_name_rank"] = units.groupby("unit_name").cumcount() + 1
    units["keep_best_name_record"] = units["same_name_rank"] == 1

    # final keep suggestion
    units["keep_for_product"] = (
        units["keep_best_name_record"] &
        (~units["is_dummy_name"]) &
        (~units["is_special_entity"]) &
        (~units["is_price_outlier"]) &
        (~units["is_zero_row"])
    )

    # quality label
    units["quality_label"] = np.select(
        [
            units["keep_for_product"],
            units["is_dummy_name"] | units["is_special_entity"] | units["is_price_outlier"],
            units["is_zero_row"],
            ~units["keep_best_name_record"],
        ],
        [
            "keep",
            "entity_noise",
            "zero_row",
            "duplicate_name_alt",
        ],
        default="review"
    )

    clean_units = units[[
        "_row_id", "unit_id", "unit_name", "unit_img", "trend", "price",
        "all_pick_rate_main", "all_pick_rate_sub", "avg_ranking", "pick_rate_4", "pick_rate_1",
        "traits", "trait_count", "recommended_item_ids", "recommended_item_names", "recommended_item_count",
        "tags",
        "same_name_rank", "keep_best_name_record",
        "is_zero_row", "is_dummy_name", "is_special_entity", "is_price_outlier",
        "keep_for_product", "quality_label"
    ]].copy()

    clean_units = clean_units.rename(columns={"_row_id": "unit_row_id"})

    clean_units_core = clean_units[clean_units["keep_for_product"]].copy()

    return {
        "clean_units": clean_units,
        "clean_units_core": clean_units_core,
    }


def clean_traits(raw: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    trait_rankings = raw["trait_rankings"].copy()
    trait_num_levels = raw["trait_num_levels"].copy()

    trait_rankings = add_base_trait_name(trait_rankings, "trait_name")
    trait_rankings["active_num"] = (
        trait_rankings["trait_name"].astype(str).str.extract(r"^(\d+)")[0]
    )
    trait_rankings["active_num"] = to_num(trait_rankings["active_num"])

    levels_agg = (
        trait_num_levels.groupby("trait_ranking_row_id")
        .agg(
            available_levels=("level_value", lambda s: safe_join(s, "|")),
            available_level_count=("level_value", "count")
        )
        .reset_index()
    )

    clean_traits = trait_rankings.merge(
        levels_agg, how="left", left_on="_row_id", right_on="trait_ranking_row_id"
    )

    clean_traits = clean_traits[[
        "_row_id", "trait_id", "trait_name", "base_trait_name", "active_num",
        "trait_img", "trend", "all_pick_rate_main", "all_pick_rate_sub", "avg_ranking",
        "pick_rate_4", "pick_rate_1", "extra_index", "extra_num", "extra_color",
        "available_levels", "available_level_count"
    ]].copy()

    clean_traits = clean_traits.rename(columns={"_row_id": "trait_row_id"})

    return {
        "clean_traits": clean_traits
    }


def clean_items(raw: Dict[str, pd.DataFrame], clean_units_df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    item_rankings = raw["item_rankings"].copy()
    item_pieces = raw["item_pieces"].copy()
    item_tags = raw["item_tags"].copy()

    # Map piece_id -> preferred unit_name using core units first, then any unit
    unit_map = clean_units_df.sort_values(
        by=["keep_for_product", "all_pick_rate_main"],
        ascending=[False, False]
    ).drop_duplicates("unit_id")[["unit_id", "unit_name"]]

    item_pieces2 = item_pieces.merge(unit_map, how="left", left_on="piece_id", right_on="unit_id")
    item_pieces_agg = (
        item_pieces2.groupby("item_ranking_row_id")
        .agg(
            suggested_piece_ids=("piece_id", lambda s: safe_join(s, "|")),
            suggested_piece_names=("unit_name", lambda s: safe_join(s, "|")),
            suggested_piece_count=("piece_id", "count")
        )
        .reset_index()
    )

    item_tags_agg = (
        item_tags.groupby("item_ranking_row_id")
        .agg(
            tags=("tag_value", lambda s: safe_join(s, "|"))
        )
        .reset_index()
    )

    clean_items = item_rankings.merge(item_pieces_agg, how="left", left_on="_row_id", right_on="item_ranking_row_id")
    clean_items = clean_items.merge(item_tags_agg, how="left", left_on="_row_id", right_on="item_ranking_row_id")

    clean_items = clean_items[[
        "_row_id", "item_id", "item_name", "item_img", "trend", "item_type",
        "all_pick_rate_main", "all_pick_rate_sub", "avg_ranking", "pick_rate_4", "pick_rate_1",
        "suggested_piece_ids", "suggested_piece_names", "suggested_piece_count",
        "tags"
    ]].copy()
    clean_items = clean_items.rename(columns={"_row_id": "item_row_id"})

    return {
        "clean_items": clean_items
    }


def clean_augments(raw: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    augment_rankings = raw["augment_rankings"].copy()
    augment_stage_stats = raw["augment_stage_stats"].copy()

    # 99999 means unavailable / invalid stage stat
    augment_stage_stats["avg_ranking"] = to_num(augment_stage_stats["avg_ranking"])
    augment_stage_stats.loc[augment_stage_stats["avg_ranking"] >= 99999, "avg_ranking"] = np.nan

    stage_pick = (
        augment_stage_stats.pivot_table(
            index="augment_ranking_row_id",
            columns="stage_order",
            values="stage_pick_rate",
            aggfunc="first"
        ).add_prefix("stage_pick_rate_")
         .reset_index()
    )

    stage_avg = (
        augment_stage_stats.pivot_table(
            index="augment_ranking_row_id",
            columns="stage_order",
            values="avg_ranking",
            aggfunc="first"
        ).add_prefix("stage_avg_ranking_")
         .reset_index()
    )

    clean_augments = augment_rankings.merge(
        stage_pick, how="left", left_on="_row_id", right_on="augment_ranking_row_id"
    ).merge(
        stage_avg, how="left", left_on="_row_id", right_on="augment_ranking_row_id"
    )

    stage_cols = [c for c in clean_augments.columns if c.startswith("stage_avg_ranking_")]
    clean_augments["available_stage_count"] = clean_augments[stage_cols].notna().sum(axis=1)

    clean_augments = clean_augments[[
        "_row_id", "augment_id", "augment_name", "augment_img", "trend", "color_type",
        "description", "all_pick_rate_main", "all_pick_rate_sub", "avg_ranking", "pick_rate_4", "pick_rate_1",
        "stage_pick_rate_1", "stage_pick_rate_2", "stage_pick_rate_3",
        "stage_avg_ranking_1", "stage_avg_ranking_2", "stage_avg_ranking_3",
        "available_stage_count"
    ]].copy()

    clean_augments = clean_augments.rename(columns={"_row_id": "augment_row_id"})

    return {
        "clean_augments": clean_augments
    }


def clean_comps(raw: Dict[str, pd.DataFrame], clean_units_df: pd.DataFrame, clean_items_df: pd.DataFrame, clean_traits_df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    comps = raw["comp_rankings"].copy()
    comp_pieces = raw["comp_pieces"].copy()
    comp_piece_eq = raw["comp_piece_equipments"].copy()

    # unit lookup
    unit_lookup = clean_units_df.sort_values(
        by=["keep_for_product", "all_pick_rate_main"],
        ascending=[False, False]
    ).drop_duplicates("unit_id")[[
        "unit_id", "unit_name", "price", "traits", "keep_for_product", "quality_label"
    ]]

    item_lookup = clean_items_df[["item_id", "item_name"]].copy()

    # comp units with derived fields
    comp_units = comp_pieces.merge(unit_lookup, how="left", left_on="piece_id", right_on="unit_id", suffixes=("", "_unit"))
    eq_counts = comp_piece_eq.groupby("comp_piece_row_id").size().rename("equipment_count").reset_index()

    eq_agg = (
        comp_piece_eq.merge(item_lookup, how="left", left_on="equipment_id", right_on="item_id")
        .groupby("comp_piece_row_id")
        .agg(
            equipment_ids=("equipment_id", lambda s: safe_join(s, "|")),
            equipment_names=("item_name", lambda s: safe_join(s, "|")),
            equipment_count=("equipment_id", "count")
        )
        .reset_index()
    )

    comp_units = comp_units.merge(eq_agg, how="left", left_on="_row_id", right_on="comp_piece_row_id")
    comp_units["equipment_count"] = comp_units["equipment_count"].fillna(0).astype(int)
    comp_units["is_core_unit"] = (to_num(comp_units["star_num"]).fillna(0) >= 3) | (comp_units["equipment_count"] >= 1)

    comp_units_out = comp_units[[
        "_row_id", "comp_ranking_row_id", "piece_order", "piece_id", "piece_name", "piece_img",
        "piece_price", "star_num", "equipment_ids", "equipment_names", "equipment_count",
        "is_core_unit", "traits", "keep_for_product", "quality_label"
    ]].copy().rename(columns={"_row_id": "comp_piece_row_id"})

    # comp summaries
    comp_unit_agg = (
        comp_units_out.groupby("comp_ranking_row_id")
        .agg(
            unit_ids=("piece_id", lambda s: safe_join(s, "|")),
            unit_names=("piece_name", lambda s: safe_join(s, "|")),
            core_unit_names=("piece_name", lambda s: safe_join(
                comp_units_out.loc[s.index, "piece_name"][comp_units_out.loc[s.index, "is_core_unit"]].tolist(), "|"
            )),
            low_cost_3star_count=("star_num", lambda s: int(((to_num(s).fillna(0) >= 3) & (to_num(comp_units_out.loc[s.index, "piece_price"]).fillna(99) <= 3)).sum())),
            avg_unit_cost=("piece_price", "mean"),
            max_unit_cost=("piece_price", "max")
        )
        .reset_index()
    )

    # derive comp traits from unit traits
    unit_traits = raw["unit_traits"].merge(
        raw["unit_rankings"][["_row_id", "unit_id"]],
        how="left",
        left_on="unit_ranking_row_id",
        right_on="_row_id"
    )[["unit_id", "trait_name"]].drop_duplicates()

    unit_traits["base_trait_name"] = unit_traits["trait_name"].astype(str).str.strip()

    comp_unit_traits = comp_pieces[["comp_ranking_row_id", "piece_id"]].merge(
        unit_traits, how="left", left_on="piece_id", right_on="unit_id"
    )
    comp_trait_counts = (
        comp_unit_traits.groupby(["comp_ranking_row_id", "base_trait_name"])
        .size().rename("unit_count").reset_index()
    )

    # join possible activation levels
    trait_levels = clean_traits_df[["base_trait_name", "active_num"]].dropna().drop_duplicates()
    comp_trait_levels = comp_trait_counts.merge(trait_levels, how="left", on="base_trait_name")
    comp_trait_levels["active_num"] = to_num(comp_trait_levels["active_num"])
    comp_trait_levels = comp_trait_levels[comp_trait_levels["unit_count"] >= comp_trait_levels["active_num"]].copy()

    comp_trait_best = (
        comp_trait_levels.sort_values(["comp_ranking_row_id", "base_trait_name", "active_num"], ascending=[True, True, False])
        .drop_duplicates(["comp_ranking_row_id", "base_trait_name"])
        .rename(columns={"active_num": "activated_level"})
    )

    comp_traits_out = comp_trait_best[[
        "comp_ranking_row_id", "base_trait_name", "unit_count", "activated_level"
    ]].copy()

    comp_traits_agg = (
        comp_traits_out.sort_values(["comp_ranking_row_id", "activated_level"], ascending=[True, False])
        .groupby("comp_ranking_row_id")
        .agg(
            derived_traits=("base_trait_name", lambda s: safe_join(s, "|")),
            derived_trait_levels=("activated_level", lambda s: safe_join(s, "|")),
            derived_trait_count=("base_trait_name", "count")
        )
        .reset_index()
    )

    # level focus
    for c in ["level_rate_7", "level_rate_8", "level_rate_9"]:
        comps[c] = to_num(comps[c])

    def infer_roll_level(row):
        vals = {
            "lvl7": row.get("level_rate_7", np.nan),
            "lvl8": row.get("level_rate_8", np.nan),
            "lvl9": row.get("level_rate_9", np.nan),
        }
        vals = {k: (-1 if pd.isna(v) else v) for k, v in vals.items()}
        return max(vals, key=vals.get)

    comps["roll_level_hint"] = comps.apply(infer_roll_level, axis=1)

    comps = comps.merge(comp_unit_agg, how="left", left_on="_row_id", right_on="comp_ranking_row_id")
    comps = comps.merge(comp_traits_agg, how="left", left_on="_row_id", right_on="comp_ranking_row_id")

    comps["reroll_hint"] = comps["low_cost_3star_count"].fillna(0).astype(int) >= 1
    comps["cap_style_hint"] = np.select(
        [
            comps["roll_level_hint"].eq("lvl9"),
            comps["roll_level_hint"].eq("lvl8"),
            comps["roll_level_hint"].eq("lvl7")
        ],
        ["fast9", "level8_core", "reroll_or_level7"],
        default="unknown"
    )

    # mode hint limitation: comp rows do not carry explicit mode id
    # so only keep a note rather than forcing a wrong join
    comps["mode_hint"] = np.nan

    clean_comps = comps[[
        "_row_id", "group_id", "camp_name", "score", "all_pick_rate", "avg_ranking", "pick_rate_1", "pick_rate_4",
        "level_rate_7", "level_rate_8", "level_rate_9",
        "roll_level_hint", "reroll_hint", "cap_style_hint",
        "unit_ids", "unit_names", "core_unit_names", "avg_unit_cost", "max_unit_cost",
        "derived_traits", "derived_trait_levels", "derived_trait_count",
        "trait_img", "author_name", "camp_code", "camp_core_num", "camp_url",
        "change_all_pick_rate_type", "change_all_pick_rate_value",
        "change_avg_ranking_type", "change_avg_ranking_value",
        "change_pick_rate_4_type", "change_pick_rate_4_value",
        "change_pick_rate_1_type", "change_pick_rate_1_value",
        "mode_hint"
    ]].copy().rename(columns={"_row_id": "comp_row_id"})

    return {
        "clean_comps": clean_comps,
        "clean_comp_units": comp_units_out,
        "clean_comp_traits": comp_traits_out.rename(columns={"comp_ranking_row_id": "comp_row_id"}),
    }


def write_csv(df: pd.DataFrame, out_dir: Path, name: str):
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_dir / f"{name}.csv", index=False, encoding="utf-8-sig")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default=".", help="Directory containing the raw CSV files")
    parser.add_argument("--output-dir", default="./clean_output", help="Directory for cleaned outputs")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    ensure_required_files(input_dir)

    raw = {f.replace(".csv", ""): read_csv(input_dir, f) for f in REQUIRED_FILES}

    validation = build_validation_summary(raw)

    # clean layers
    unit_outputs = clean_units(raw)
    trait_outputs = clean_traits(raw)
    item_outputs = clean_items(raw, unit_outputs["clean_units"])
    augment_outputs = clean_augments(raw)
    comp_outputs = clean_comps(raw, unit_outputs["clean_units"], item_outputs["clean_items"], trait_outputs["clean_traits"])

    all_outputs = {}
    all_outputs.update(unit_outputs)
    all_outputs.update(trait_outputs)
    all_outputs.update(item_outputs)
    all_outputs.update(augment_outputs)
    all_outputs.update(comp_outputs)

    csv_dir = output_dir / "csv"
    for name, df in all_outputs.items():
        write_csv(df, csv_dir, name)

    # summary
    summary = {
        "input_dir": str(input_dir.resolve()),
        "output_dir": str(output_dir.resolve()),
        "validation": validation,
        "tables": {
            name: {
                "rows": int(len(df)),
                "columns": list(df.columns)
            }
            for name, df in all_outputs.items()
        },
        "notes": [
            "clean_units contains flags; clean_units_core is the recommended unit set for product use.",
            "clean_comps derives roll_level_hint and basic comp traits from unit traits.",
            "clean_comp_traits is derived from unit trait counts plus trait activation thresholds.",
            "comp rows do not contain a reliable explicit mode id; mode_hint is intentionally left blank.",
            "augment stage avg_ranking=99999 is treated as missing.",
        ]
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("Done.")
    print(f"Clean CSVs written to: {csv_dir}")
    print(f"Summary written to:   {output_dir / 'summary.json'}")


if __name__ == "__main__":
    main()

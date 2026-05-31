def build_metrics_id(
    model_name: str, train_scenarios: list[str], test_scenario: str
) -> str:
    """
    Формирует id метрики.
    Пример: regmodel_v1v2_v3

    model_name = "regmodel"
    train_scenarios = ["dep1_v1", "dep1_v2"]  -> "v1v2"
    test_scenario = "dep1_v3"                 -> "v3"
    """
    # Извлекаем суффиксы сценариев (часть после последнего '_')
    train_suffixes = []
    for s in sorted(train_scenarios):
        parts = s.rsplit("_", 1)
        train_suffixes.append(parts[-1] if len(parts) > 1 else s)

    test_parts = test_scenario.rsplit("_", 1)
    test_suffix = test_parts[-1] if len(test_parts) > 1 else test_scenario

    train_part = "".join(train_suffixes)

    return f"{model_name}_{train_part}_{test_suffix}"

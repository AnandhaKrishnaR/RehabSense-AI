from rest_framework.views import exception_handler

def custom_exception_handler(exc, context):
    """
    Standardizes error responses across all DRF views according to docs/api-contracts.md:
    {
        "error": "<error_code_or_class>",
        "detail": "<human_readable_detail>",
        "field_errors": {
            "<field_name>": ["<error_detail>"]
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        data = response.data
        error_type = exc.__class__.__name__
        detail = "An error occurred."
        field_errors = {}

        if isinstance(data, dict):
            if "detail" in data:
                detail = str(data["detail"])
            if "error" in data:
                error_type = str(data["error"])
            for k, v in data.items():
                if k not in ("detail", "error"):
                    field_errors[k] = v if isinstance(v, list) else [str(v)]
        elif isinstance(data, list):
            detail = "; ".join([str(item) for item in data])
        else:
            detail = str(data)

        formatted_data = {
            "error": error_type,
            "detail": detail,
        }
        if field_errors:
            formatted_data["field_errors"] = field_errors

        response.data = formatted_data

    return response

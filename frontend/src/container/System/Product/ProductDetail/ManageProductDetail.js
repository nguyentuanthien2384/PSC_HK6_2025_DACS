import React from 'react';
import { getAllProductDetailByIdService, DeleteProductDetailService } from '../../../../services/userService';
import { toast } from 'react-toastify';
import { PAGINATION } from '../../../../utils/constant';
import ReactPaginate from 'react-paginate';
import CommonUtils from '../../../../utils/CommonUtils';
import { Link, useParams } from 'react-router-dom';
import usePagedAdminList from '../../usePagedAdminList';

const ManageProductDetail = () => {

    const { id } = useParams()
    const { data: dataProductDetail, count, page: numberPage, setPage, loading, error, reload } = usePagedAdminList(getAllProductDetailByIdService, { id });
    let handleDeleteProductDetail = async (productdetailId) => {
        let response = await DeleteProductDetailService({
            data: {
                id: productdetailId
            }
        })
        if (response && response.errCode === 0) {
            toast.success("Xóa chi tiết sản phẩm thành công !")

            reload();

        } else {
            toast.error("Xóa sản phẩm thất bại")
        }
    }
    let handleChangePage = number => { if (!loading) setPage(number.selected); };
    return (
        <div className="container-fluid px-4">
            <h1 className="mt-4">Quản lý chi tiết sản phẩm</h1>


            <div className="card mb-4">
                <div className="card-header">
                    <i className="fas fa-table me-1" />
                    Danh sách chi tiết sản phẩm
                    <div className="float-right"><Link to={`/system/home/add-product-detail/${id}`}><i style={{ fontSize: '35px', cursor: 'pointer', color: '#0D6EFD' }} className="fas fa-plus-square"></i></Link></div>
                </div>
                <div className="card-body">
                    <p role="status" style={{ minHeight: 24 }}>{loading ? 'Đang tải chi tiết sản phẩm…' : ''}</p>
                    {error && <p role="alert">{error} <button type="button" onClick={reload}>Thử lại</button></p>}
                    <div className="table-responsive" aria-busy={loading}>
                        <table className="table table-bordered" inert={loading ? true : undefined} style={{ border: '1' }} width="100%" cellSpacing="0">
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th>Tên loại sản phẩm</th>
                                    <th>Giá gốc</th>
                                    <th>Giá khuyến mãi</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>

                            <tbody>
                                {dataProductDetail && dataProductDetail.length > 0 &&
                                    dataProductDetail.map((item, index) => {
                                        return (
                                            <tr key={item.id}>
                                                <td>{numberPage * PAGINATION.pagerow + index + 1}</td>
                                                <td>{item.nameDetail}</td>
                                                <td>{CommonUtils.formatter.format(item.originalPrice)}</td>
                                                <td>{CommonUtils.formatter.format(item.discountPrice)}</td>
                                                <td>
                                                    <Link to={`/system/home/list-product-detail-image/${item.id}`}>View</Link>
                                                    &nbsp; &nbsp;
                                                    <Link to={`/system/home/update-product-detail/${item.id}`}>Edit</Link>
                                                    &nbsp; &nbsp;
                                                    <span onClick={() => handleDeleteProductDetail(item.id)} style={{ color: '#0E6DFE', cursor: 'pointer' }}   >Delete</span>

                                                </td>
                                            </tr>
                                        )
                                    })
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <ReactPaginate
                previousLabel={'Quay lại'}
                nextLabel={'Tiếp'}
                breakLabel={'...'}
                pageCount={Math.max(1, count)}
                forcePage={numberPage}
                disableInitialCallback
                marginPagesDisplayed={3}
                containerClassName={"pagination justify-content-center"}
                pageClassName={"page-item"}
                pageLinkClassName={"page-link"}
                previousLinkClassName={"page-link"}
                nextClassName={"page-item"}
                nextLinkClassName={"page-link"}
                breakLinkClassName={"page-link"}
                breakClassName={"page-item"}
                activeClassName={"active"}
                onPageChange={handleChangePage}
            />
        </div>
    )
}
export default ManageProductDetail;
